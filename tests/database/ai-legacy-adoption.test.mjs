import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, as, id, json } from "./ai-legacy-adoption-fixture.mjs";
import { matchesLegacyAdoptionProposal } from "../../apps/api/src/money/legacy-adoption-proposal.ts";
const member = { userId: id(1), householdId: id(10) };
test("concurrent AI proposals bind fresh source once; only native approval adopts it", async (t) => {
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
  assert.equal(matchesLegacyAdoptionProposal(f.input, value, member), true);
  assert.equal(
    matchesLegacyAdoptionProposal({ ...f.input, ruleId: id(901) }, value, member),
    false,
  );
  assert.equal(matchesLegacyAdoptionProposal(f.input, value, { ...member, userId: id(2) }), false);
  assert.equal(
    matchesLegacyAdoptionProposal(f.input, value, { ...member, householdId: id(11) }),
    false,
  );
  assert.deepEqual(approval.input.configuration, f.input.configuration);
  assert.equal(
    matchesLegacyAdoptionProposal(
      { ...f.input, configuration: { ...f.input.configuration, note: "Different" } },
      value,
      member,
    ),
    false,
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select row_to_json(d) from public.expense_drafts d"), before);
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_adoption_operations"), "0");
  for (const tool of [
    "saveLegacyAdoption",
    "executeLegacyAdoption",
    "decideLegacyAdoption",
    "withdrawLegacyAdoption",
  ])
    assert.throws(() => f.execute(turn, f.input, tool, tool), /Invalid AI command/);
  assert.throws(() => f.db.sql(as(f.command(turn, f.input), id(2))), /Not authorized/);
  const result = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_decide_legacy_adoption('${id(10)}','${approval.operationId}',${json(approval.input)},'${approval.id}',true)`,
      ),
    ),
  );
  assert.equal(result.approval.status, "consumed");
  assert.equal(f.db.sql("select status from public.expense_drafts"), "dismissed");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "f");
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
  assert.throws(() => f.execute(turn, { ...f.input, ruleId: id(901) }), /command changed/);
  const response = {
    id: f.db.sql(`select assistant_id from public.nest_ai_turns where operation_id='${turn.turn}'`),
    role: "assistant",
    parts: [
      {
        type: "tool-proposeLegacyAdoption",
        toolCallId: "adoption",
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
  assert.equal(f.db.sql("select status from public.expense_drafts"), "dismissed");
});

test("AI rejects injected authority, invalid financial terms and unreconciled legacy drafts", (t) => {
  const f = fixture(t),
    turn = f.start();
  let call = 0;
  const reject = (input) => {
    try {
      assert.equal(f.execute(turn, input, `bad-${call++}`).ok, false);
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
    }
  };
  for (const patch of [
    { ruleId: id(999) },
    { approved: true },
    { approvalId: id(999) },
    { reviewToken: "0".repeat(64) },
    { firstDueOn: "2026-01-01" },
    { configuration: { ...f.input.configuration, payerId: id(3) } },
    { configuration: { ...f.input.configuration, startDate: "2000-01-01" } },
    { configuration: { ...f.input.configuration, amountCentimes: "999" } },
  ])
    reject({ ...f.input, ...patch });
  f.db.sql("update public.expense_drafts set status='pending'");
  reject(f.input);
  f.db.sql("update public.expense_drafts set status='posted'");
  reject(f.input);
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_legacy_recurring_adoptions"), "0");
  assert.throws(() => f.db.sql(as(f.command(turn, f.input, "foreign"), id(2))), /Not authorized/);
});
test("server derives non-overlapping adoption cycle from retained future history", (t) => {
  const f = fixture(t),
    turn = f.start();
  f.db.sql("update public.expense_drafts set occurred_on='9998-12-31'");
  const result = f.execute(turn, f.input);
  assert.equal(result.ok, true);
  assert.ok(result.value.approval.input.firstDueOn > "9998-12-31");
  assert.notEqual(result.value.approval.input.firstDueOn, f.input.configuration.startDate);
  assert.equal(f.db.sql("select active from public.recurring_expense_rules"), "t");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
