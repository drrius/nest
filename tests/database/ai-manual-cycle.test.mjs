import { payload as configuration } from "./ai-recurring-fixture.mjs";
import { replacement } from "./native-correction-fixture.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, as, id, json } from "./ai-manual-cycle-fixture.mjs";
import { matchesManualCycleProposal } from "../../apps/api/src/money/recurring-manual-proposal.ts";
for (const action of ["cycle"]) {
  test(`concurrent AI ${action} yields one private pending manual-cycle; only native approval links the expense`, async (t) => {
    const f = fixture(t),
      turn = f.start();
    const rows = await Promise.all(
      Array.from({ length: 4 }, () => f.db.concurrent(as(f.command(turn, f.input)))),
    );
    const results = rows.map((row) => JSON.parse(row.stdout));
    for (const result of results) assert.deepEqual(result, results[0]);
    const { approval } = results[0].value;
    assert.equal(approval.status, "pending");
    assert.equal(
      matchesManualCycleProposal(f.input, results[0].value, {
        userId: id(1),
        householdId: id(10),
      }),
      true,
    );
    assert.equal(
      matchesManualCycleProposal({ ...f.input, dueOn: "2099-01-31" }, results[0].value, {
        userId: id(1),
        householdId: id(10),
      }),
      false,
    );
    assert.equal(
      matchesManualCycleProposal(f.input, results[0].value, {
        userId: id(2),
        householdId: id(10),
      }),
      false,
    );
    assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
    assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "1");
    for (const tool of [
      "saveManualCycle",
      "executeManualCycle",
      "decideManualCycle",
      "approveAction",
    ])
      assert.throws(() => f.execute(turn, f.input, tool, tool), /Invalid AI command/);
    assert.throws(() => f.db.sql(as(f.command(turn, f.input), id(2))), /Not authorized/);
    const result = JSON.parse(
      f.db.sql(
        as(
          `select public.nest_decide_manual_cycle('${id(10)}','${approval.operationId}',${json(approval.input)},'${approval.id}',true)`,
        ),
      ),
    );
    assert.equal(result.approval.status, "consumed");
    assert.equal(result.approval.receipt.source, "manual");
    assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
    assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
    assert.deepEqual(f.execute(turn, f.input), results[0]);
    assert.throws(() => f.db.sql(as(f.command(turn, f.input), id(2))), /Not authorized/);
  });
}
test("manual-cycle proposal journal rollback and transcript reconciliation preserve canonical private evidence", (t) => {
  const f = fixture(t),
    turn = f.start();
  f.db.sql(
    "alter table public.nest_ai_commands add constraint fixture_journal_fail check(false) not valid",
  );
  assert.throws(() => f.execute(turn, f.input), /fixture_journal_fail/);
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  f.db.sql("alter table public.nest_ai_commands drop constraint fixture_journal_fail");
  const input = {
    ...f.input,
    expectedRevision: f.input.expectedRevision.toUpperCase(),
    sourceEventId: f.input.sourceEventId.toUpperCase(),
  };
  const result = f.execute(turn, input);
  assert.deepEqual(result.value.approval.input, f.input);
  assert.throws(() => f.execute(turn, { ...input, dueOn: "2099-01-31" }), /command changed/);
  const response = {
    id: f.db.sql(`select assistant_id from public.nest_ai_turns where operation_id='${turn.turn}'`),
    role: "assistant",
    parts: [
      {
        type: "tool-proposeManualCycle",
        toolCallId: "cycle",
        state: "output-available",
        input,
        output: { ok: true, value: { resumed: true } },
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
  assert.equal(f.db.sql("select status from public.nest_recurring_rules"), "active");
});
test("stale, foreign and invalid cycle proposals cannot target a different rule or bypass explicit action", (t) => {
  const f = fixture(t),
    turn = f.start();
  let call = 0;
  for (const patch of [
    { expectedRevision: id(999) },
    { sourceEventId: id(999) },
    { ruleId: id(999) },
    { approved: true },
    { dueOn: "2099-01-31" },
  ]) {
    try {
      assert.equal(f.execute(turn, { ...f.input, ...patch }, `invalid-${call++}`).ok, false);
    } catch (error) {
      if (error.code === "ERR_ASSERTION") throw error;
    }
  }
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.throws(() => f.db.sql(as(f.command(turn, f.input, "foreign"), id(3))), /Not authorized/);
});

test("extended cycle registry retains configuration and expense proposals without mutating rules or ledger", (t) => {
  const f = fixture(t),
    turn = f.start();
  const setup = f.execute(turn, configuration(f.db), "setup", "proposeRecurring");
  const expense = f.execute(turn, replacement().expense, "expense", "proposeExpense");
  const stop = f.execute(
    turn,
    {
      ruleId: f.input.ruleId,
      expectedRevision: f.input.expectedRevision,
      expectedStatus: "active",
      action: "cancel",
    },
    "stop",
    "proposeRecurringState",
  );
  assert.equal(stop.value.approval.status, "pending");
  assert.equal(setup.value.approval.status, "pending");
  assert.equal(expense.value.approval.status, "pending");
  assert.equal(f.db.sql("select count(*) from public.nest_action_approvals"), "3");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_revisions"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
});

test("AI manual proposal supports an explicitly differing fixed rule without changing either expense or mandate", (t) => {
  const f = fixture(t),
    turn = f.start();
  const base = configuration(f.db),
    today = f.input.dueOn;
  const rule = {
    ...base,
    ruleId: id(400),
    firstDueOn: today,
    configuration: {
      ...base.configuration,
      startDate: today,
      schedule: { kind: "monthly", dayOfMonth: Number(today.slice(8)) },
      mode: "fixed",
      amountCentimes: "900",
      allocations: [
        { memberId: id(1), centimes: "450" },
        { memberId: id(2), centimes: "450" },
      ],
    },
  };
  const saved = JSON.parse(
    f.db.sql(as(`select public.nest_save_recurring('${id(10)}','${id(603)}',${json(rule)})`)),
  );
  const input = { ...f.input, ruleId: rule.ruleId, expectedRevision: saved.revision };
  const proposed = f.execute(turn, input);
  assert.equal(proposed.value.approval.status, "pending");
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_cycles"), "0");
  assert.equal(f.db.sql("select amount_cents from public.financial_events"), "101");
  assert.equal(
    f.db.sql(
      `select configuration->>'amountCentimes' from public.nest_recurring_rules where id='${rule.ruleId}'`,
    ),
    "900",
  );
});
