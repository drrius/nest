import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, as, json, id } from "./ai-recurring-fixture.mjs";
import { matchesRecurringProposal } from "../../apps/api/src/money/recurring-proposal.ts";
import { replacement } from "./native-correction-fixture.mjs";
test("concurrent AI setup creates one private proposal and server ID; only native confirmation grants a mandate", async (t) => {
  const f = fixture(t),
    turn = f.start();
  const rows = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.command(turn, f.input)))),
  );
  const results = rows.map((row) => JSON.parse(row.stdout));
  for (const result of results) assert.deepEqual(result, results[0]);
  const envelope = results[0].value,
    approval = envelope.approval;
  assert.equal(approval.status, "pending");
  assert.ok(approval.rule.ruleId);
  assert.equal(
    matchesRecurringProposal(f.input, envelope, { userId: id(1), householdId: id(10) }),
    true,
  );
  assert.equal(
    matchesRecurringProposal(f.input, envelope, { userId: id(2), householdId: id(10) }),
    false,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_rules"), "0");
  for (const tool of ["saveRecurring", "executeRecurring", "decideRecurring", "approveAction"])
    assert.throws(() => f.execute(turn, f.input, tool, tool), /Invalid AI command/);
  assert.throws(() => f.db.sql(as(f.command(turn, f.input), id(2))), /Not authorized/);
  const result = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_decide_recurring('${id(10)}','${approval.operationId}',${json(approval.rule)},'${approval.id}',true)`,
      ),
    ),
  );
  assert.equal(result.approval.status, "consumed");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  assert.deepEqual(f.execute(turn, f.input), results[0]);
});
test("variable setup grants no cycle amount and the extended registry retains expense proposals", (t) => {
  const f = fixture(t),
    turn = f.start();
  const input = {
    ...f.input,
    configuration: {
      ...f.input.configuration,
      mode: "variable",
      amountCentimes: null,
      allocations: null,
    },
  };
  const proposal = f.execute(turn, input).value.approval;
  assert.equal(proposal.rule.configuration.amountCentimes, null);
  assert.equal(proposal.rule.configuration.allocations, null);
  const approved = JSON.parse(
    f.db.sql(
      as(
        `select public.nest_decide_recurring('${id(10)}','${proposal.operationId}',${json(proposal.rule)},'${proposal.id}',true)`,
      ),
    ),
  );
  assert.equal(approved.approval.status, "consumed");
  const expense = f.execute(turn, replacement().expense, "expense", "proposeExpense");
  assert.equal(expense.value.approval.status, "pending");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.execute(turn, input, "revoked"), /Not authorized/);
});
test("proposal journal rollback, canonical replay and transcript recovery never fabricate approval", (t) => {
  const f = fixture(t),
    turn = f.start();
  f.db.sql(
    "alter table public.nest_ai_commands add constraint fixture_journal_fail check(false) not valid",
  );
  assert.throws(() => f.execute(turn, f.input), /fixture_journal_fail/);
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  f.db.sql("alter table public.nest_ai_commands drop constraint fixture_journal_fail");
  const result = f.execute(turn, f.input);
  assert.throws(() => f.execute(turn, { ...f.input, firstDueOn: "2026-01-01" }), /command changed/);
  const response = {
    id: f.db.sql(`select assistant_id from public.nest_ai_turns where operation_id='${turn.turn}'`),
    role: "assistant",
    parts: [
      {
        type: "tool-proposeRecurring",
        toolCallId: "recurring",
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
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_rules"), "0");
});
test("recurring AI changes bind current revision, members, prospective cycle and exact configuration", (t) => {
  const f = fixture(t),
    turn = f.start();
  const savedInput = { ...f.input, ruleId: id(300) };
  const saved = JSON.parse(
    f.db.sql(as(`select public.nest_save_recurring('${id(10)}','${id(600)}',${json(savedInput)})`)),
  );
  const input = { ...savedInput, expectedRevision: saved.revision };
  const result = f.execute(turn, input);
  assert.equal(result.value.approval.status, "pending");
  assert.equal(
    matchesRecurringProposal(input, result.value, { userId: id(1), householdId: id(10) }),
    true,
  );
  assert.deepEqual(f.execute(turn, { ...input, expectedRevision: id(999) }, "stale"), {
    ok: false,
    code: "conflict",
  });
  let index = 0;
  for (const patch of [
    { approved: true },
    { ruleId: id(999), expectedRevision: null },
    { ruleId: null, expectedRevision: saved.revision },
    { configuration: { ...input.configuration, payerId: id(3) } },
    { configuration: { ...input.configuration, categoryId: id(999) } },
    { configuration: { ...input.configuration, startDate: "2000-01-01" } },
    { configuration: { ...input.configuration, mode: "variable" } },
  ]) {
    try {
      assert.equal(f.execute(turn, { ...input, ...patch }, `invalid-${index++}`).ok, false);
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
    }
  }
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "1");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
