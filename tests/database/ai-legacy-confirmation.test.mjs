import { payload as expense } from "./native-expense-helpers.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, as, id, json } from "./ai-legacy-confirmation-fixture.mjs";
import { matchesLegacyConfirmationProposal } from "../../apps/api/src/money/legacy-confirmation-proposal.ts";
const member = { userId: id(1), householdId: id(10) };
test("concurrent AI proposals bind fresh draft state once; only native confirmation posts it", async (t) => {
  const f = fixture(t),
    turn = f.start();
  const before = f.db.sql("select row_to_json(d) from public.expense_drafts d");
  const rows = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.command(turn, f.input)))),
  );
  const results = rows.map((row) => JSON.parse(row.stdout));
  for (const row of results) assert.deepEqual(row, results[0]);
  const value = results[0].value,
    approval = value.approval;
  assert.equal(approval.status, "pending");
  assert.equal(approval.input.ruleId, id(800));
  assert.match(approval.input.reviewToken, /^[a-f0-9]{64}$/);
  assert.equal(matchesLegacyConfirmationProposal(f.input, value, member), true);
  assert.equal(
    matchesLegacyConfirmationProposal({ ...f.input, draftId: id(901) }, value, member),
    false,
  );
  assert.equal(
    matchesLegacyConfirmationProposal(f.input, value, { ...member, userId: id(2) }),
    false,
  );
  assert.equal(
    matchesLegacyConfirmationProposal(f.input, value, { ...member, householdId: id(11) }),
    false,
  );
  assert.deepEqual(approval.input.expense, f.input.expense);
  assert.equal(
    matchesLegacyConfirmationProposal(
      { ...f.input, expense: { ...f.input.expense, note: "Different" } },
      value,
      member,
    ),
    false,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select row_to_json(d) from public.expense_drafts d"), before);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_confirmation_operations"), "0");
  for (const tool of [
    "saveLegacyConfirmation",
    "executeLegacyConfirmation",
    "decideLegacyConfirmation",
    "withdrawLegacyConfirmation",
  ])
    assert.throws(() => f.execute(turn, f.input, tool, tool), /Invalid AI command/);
  assert.throws(() => f.db.sql(as(f.command(turn, f.input), id(2))), /Not authorized/);
  const result = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_decide_legacy_confirmation('${id(10)}','${approval.operationId}',${json(approval.input)},'${approval.id}',true)`,
      ),
    ),
  );
  assert.equal(result.approval.status, "consumed");
  assert.equal(f.db.sql("select status from public.expense_drafts"), "posted");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "t");
  assert.deepEqual(f.execute(turn, f.input), results[0]);
});
test("journal failure rolls back proposal and transcript reconciliation replaces model-fabricated output", (t) => {
  const f = fixture(t),
    turn = f.start();
  f.db.sql(
    "alter table public.nest_ai_commands add constraint fixture_journal_fail check(false) not valid",
  );
  assert.throws(() => f.execute(turn, f.input), /fixture_journal_fail/);
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  f.db.sql("alter table public.nest_ai_commands drop constraint fixture_journal_fail");
  const result = f.execute(turn, f.input);
  assert.throws(() => f.execute(turn, { ...f.input, draftId: id(901) }), /command changed/);
  const response = {
    id: f.db.sql(`select assistant_id from public.nest_ai_turns where operation_id='${turn.turn}'`),
    role: "assistant",
    parts: [
      {
        type: "tool-proposeLegacyConfirmation",
        toolCallId: "draft",
        state: "output-available",
        input: f.input,
        output: { ok: true, value: { posted: true } },
      },
    ],
  };
  f.db.sql(
    as(
      `select public.nest_finish_ai_turn('${id(10)}','${turn.conversation}','${turn.turn}','interrupted',${json(response)})`,
    ),
  );
  const transcript = JSON.parse(
    f.db.sql(
      as(`select transcript from public.nest_ai_conversations where id='${turn.conversation}'`),
    ),
  );
  assert.deepEqual(transcript.at(-1).parts[0].output, result);
  assert.equal(transcript.at(-1).parts.length, 1);
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});
test("foreign, nonpending and model-injected approval fields cannot create confirmation proposals", (t) => {
  const f = fixture(t),
    turn = f.start();
  let call = 0;
  for (const patch of [
    { draftId: id(999) },
    { approved: true },
    { reviewToken: "0".repeat(64) },
    { ruleId: id(800) },
    { expense: { ...f.input.expense, receiptPath: null } },
    { expense: { ...f.input.expense, receiptTotalCentimes: "100" } },
    { expense: { ...f.input.expense, amountCentimes: "999" } },
    { expense: { ...f.input.expense, payerId: id(3) } },
  ]) {
    try {
      assert.equal(f.execute(turn, { ...f.input, ...patch }, `bad-${call++}`).ok, false);
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
    }
  }
  for (const status of ["posted", "dismissed"]) {
    f.db.sql(`update public.expense_drafts set status='${status}'`);
    assert.equal(f.execute(turn, f.input, status).ok, false);
  }
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  assert.throws(() => f.db.sql(as(f.command(turn, f.input, "foreign"), id(3))), /Not authorized/);
  for (const role of ["anon", "authenticated", "service_role"])
    assert.throws(
      () =>
        f.db.sql(
          `set role ${role}; select private.nest_propose_legacy_confirmation('${id(10)}','${id(701)}',${json(f.input)})`,
        ),
      /permission denied/,
    );
});

test("shopping-origin and event-linked drafts require reconciliation; existing expense proposals remain pending", (t) => {
  const f = fixture(t),
    turn = f.start();
  f.db.sql(`insert into public.shopping_sessions(id,household_id) values('${id(950)}','${id(10)}');
    update public.expense_drafts set source_kind='shopping',shopping_session_id='${id(950)}'`);
  assert.equal(f.execute(turn, f.input, "shopping").ok, false);
  f.db.sql("update public.expense_drafts set source_kind='recurring',shopping_session_id=null");
  const shares = [
    { memberId: id(1), allocatedCents: 51 },
    { memberId: id(2), allocatedCents: 50 },
  ];
  f.db.sql(
    `select private.post_financial_event('${id(10)}','${id(1)}','expense','${id(1)}','Retained event',101,${json(shares)},'2026-01-05',null,null,null,null,null,'${id(900)}',null)`,
  );
  assert.equal(f.execute(turn, f.input, "linked").ok, false);
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  const proposed = f.execute(turn, expense(), "expense", "proposeExpense");
  assert.equal(proposed.value.approval.status, "pending");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});

test("the expanded journal preserves dismissal and ordinary expense proposals without posting any of them", (t) => {
  const f = fixture(t),
    turn = f.start();
  const confirmation = f.execute(turn, f.input, "confirm");
  const dismissal = f.execute(
    turn,
    { draftId: f.input.draftId },
    "dismiss",
    "proposeLegacyDismissal",
  );
  const ordinary = f.execute(turn, expense(), "ordinary", "proposeExpense");
  for (const result of [confirmation, dismissal, ordinary]) {
    assert.equal(result.ok, true);
    assert.equal(result.value.approval.status, "pending");
  }
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "3");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select status from public.expense_drafts"), "pending");
});
