import { matchesRenewalReminderReceipt } from "../../apps/api/src/renewal-reminders/matches-receipt.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, as, id, json } from "./ai-renewal-fixture.mjs";
function setup(t) {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260922213246_native_renewal_reminder_storage.sql");
  f.db.file("supabase/migrations/20260922220043_native_ai_renewal_reminders.sql");
  const turn = f.start(),
    renewal = f.execute(turn, f.input).value.renewal;
  const input = {
    renewalId: renewal.renewalId,
    expectedRenewalRevision: renewal.revision,
    expectedRevision: null,
    settings: {
      anchor: "renewal",
      delivery: { enabled: true, recipientIds: [id(1)], localTime: "08:30", daysBefore: 7 },
    },
  };
  const command = (value = input, call = "reminder") =>
    f.command(turn, value, call, "saveRenewalReminder");
  return { ...f, turn, input, reminderCommand: command };
}
test("AI reminder journal delegates native save once under concurrent invocation retries", async (t) => {
  const f = setup(t);
  const rows = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.reminderCommand()))),
  );
  const results = rows.map((row) => JSON.parse(row.stdout));
  assert.equal(results[0].ok, true);
  const member = { userId: id(1), householdId: id(10) };
  assert.equal(
    matchesRenewalReminderReceipt("saveRenewalReminder", f.input, results[0].value, member),
    true,
  );
  assert.equal(
    matchesRenewalReminderReceipt(
      "saveRenewalReminder",
      { ...f.input, expectedRevision: id(999) },
      results[0].value,
      member,
    ),
    false,
  );
  assert.equal(
    matchesRenewalReminderReceipt("saveRenewalReminder", f.input, results[0].value, {
      ...member,
      userId: id(2),
    }),
    false,
  );
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.deepEqual(results[0].value.command.settings, f.input.settings);
  assert.equal(f.db.sql("select count(*) from public.nest_renewal_reminders"), "1");
  assert.equal(f.db.sql("select count(*) from private.nest_renewal_reminder_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("AI reminder command rejects injected identity, foreign recipients and stale baselines", (t) => {
  const f = setup(t);
  assert.throws(
    () => f.db.sql(as(f.reminderCommand({ ...f.input, operationId: id(999) }))),
    /Invalid reminder command/,
  );
  for (const [i, input] of [
    { ...f.input, expectedRenewalRevision: id(998) },
    {
      ...f.input,
      settings: {
        ...f.input.settings,
        delivery: { ...f.input.settings.delivery, recipientIds: [id(3)] },
      },
    },
  ].entries()) {
    const result = JSON.parse(f.db.sql(as(f.reminderCommand(input, `invalid-${i}`))));
    assert.equal(result.ok, false);
  }
  assert.equal(f.db.sql("select count(*) from public.nest_renewal_reminders"), "0");
});

test("AI journal failure rolls back reminder settings and native operation receipt", (t) => {
  const f = setup(t);
  f.db.sql(
    "alter table public.nest_ai_commands add constraint reject_reminder check(tool_name <> 'saveRenewalReminder')",
  );
  assert.throws(() => f.db.sql(as(f.reminderCommand())), /reject_reminder/);
  assert.equal(f.db.sql("select count(*) from public.nest_renewal_reminders"), "0");
  assert.equal(f.db.sql("select count(*) from private.nest_renewal_reminder_operations"), "0");
});

test("saved reminder transcript uses committed receipt instead of fabricated delivery claims", (t) => {
  const f = setup(t),
    turn = f.turn;
  const result = JSON.parse(f.db.sql(as(f.reminderCommand())));
  const response = {
    id: f.db.sql(`select assistant_id from public.nest_ai_turns where operation_id='${turn.turn}'`),
    role: "assistant",
    parts: [
      {
        type: "tool-saveRenewalReminder",
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
  const parts = transcript.at(-1).parts.filter((part) => part.type === "tool-saveRenewalReminder");
  assert.equal(parts.length, 1);
  assert.deepEqual(parts[0].output, result);
  assert.equal(JSON.stringify(parts).includes('"delivered":true'), false);
});
