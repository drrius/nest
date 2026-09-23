import { matchesRecurringReminderReceipt } from "../../apps/api/src/recurring-reminders/matches-receipt.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { setup, as, id, json } from "./ai-recurring-reminder-fixture.mjs";
test("AI reminder journal delegates native save once under concurrent invocation retries", async (t) => {
  const f = setup(t);
  const rows = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.reminderCommand(f.input)))),
  );
  const results = rows.map((row) => JSON.parse(row.stdout));
  assert.equal(results[0].ok, true);
  const member = { userId: id(1), householdId: id(10) };
  assert.equal(
    matchesRecurringReminderReceipt("saveRecurringReminder", f.input, results[0].value, member),
    true,
  );
  assert.equal(
    matchesRecurringReminderReceipt(
      "saveRecurringReminder",
      { ...f.input, expectedRevision: id(999) },
      results[0].value,
      member,
    ),
    false,
  );
  assert.equal(
    matchesRecurringReminderReceipt("saveRecurringReminder", f.input, results[0].value, {
      ...member,
      userId: id(2),
    }),
    false,
  );
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.deepEqual(results[0].value.command.settings, f.input.settings);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_reminders"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_recurring_reminder_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("AI reminder command rejects injected identity, foreign recipients and stale baselines", (t) => {
  const f = setup(t);
  assert.throws(
    () => f.db.sql(as(f.reminderCommand({ ...f.input, operationId: id(999) }))),
    /Invalid recurring reminder command/,
  );
  for (const [i, input] of [
    { ...f.input, expectedRuleRevision: id(999) },
    {
      ...f.input,
      settings: {
        ...f.input.settings,
        recipientIds: [id(3)],
      },
    },
  ].entries()) {
    const result = JSON.parse(f.db.sql(as(f.reminderCommand(input, `invalid-${i}`))));
    assert.equal(result.ok, false);
  }
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_reminders"), "0");
});

test("AI journal failure rolls back reminder settings and native operation receipt", (t) => {
  const f = setup(t);
  f.db.sql(
    "alter table public.nest_ai_commands add constraint reject_reminder check(tool_name <> 'saveRecurringReminder')",
  );
  assert.throws(() => f.db.sql(as(f.reminderCommand(f.input))), /reject_reminder/);
  assert.equal(f.db.sql("select count(*) from public.nest_recurring_reminders"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_recurring_reminder_operations"), "0");
});
test("saved reminder transcript uses committed receipt instead of fabricated delivery claims", (t) => {
  const f = setup(t),
    turn = f.turn;
  const result = JSON.parse(f.db.sql(as(f.reminderCommand(f.input))));
  const response = {
    id: f.db.sql(`select assistant_id from public.nest_ai_turns where operation_id='${turn.turn}'`),
    role: "assistant",
    parts: [
      {
        type: "tool-saveRecurringReminder",
        toolCallId: "reminder",
        state: "output-available",
        input: f.input,
        output: { ok: true, value: { delivered: true, cancelledContract: true } },
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
  const parts = transcript
    .at(-1)
    .parts.filter((part) => part.type === "tool-saveRecurringReminder");
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].output, result);
  assert.equal(JSON.stringify(parts).includes('"delivered":true'), false);
});

test("private recurring reminder history cannot cross owners and rejects revoked recipients", (t) => {
  const f = setup(t),
    sql = f.reminderCommand(f.input);
  const result = JSON.parse(f.db.sql(as(sql)));
  assert.equal(result.ok, true);
  assert.throws(() => f.db.sql(as(sql, id(2))), /Not authorized/);
  assert.throws(() => f.db.sql(as(sql, id(3))), /Not authorized/);
  // An item edit does not rewrite the immutable historical receipt.
  f.db.sql(
    `update private.nest_recurring_execution set next_due_on=next_due_on+1 where rule_id='${f.input.ruleId}'`,
  );
  assert.deepEqual(JSON.parse(f.db.sql(as(sql))), result);
  f.db.sql(
    `delete from public.household_members where household_id='${id(10)}' and user_id='${id(2)}'`,
  );
  // Replay still authorizes the current caller; a revoked recipient prevents a new save.
  const context = JSON.parse(
    f.db.sql(as(`select public.nest_read_recurring_reminder('${id(10)}','${f.input.ruleId}')`)),
  );
  const changed = {
    ...f.input,
    expectedDueOn: context.rule.nextDueOn,
    expectedRevision: result.value.reminder.revision,
  };
  assert.equal(JSON.parse(f.db.sql(as(f.reminderCommand(changed, "revoked-recipient")))).ok, false);
});
