import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect, Fetch } from "./renewal-fixture.mjs";
import { renewalReminderClient } from "../../apps/mobile/src/renewal-reminders/client.ts";
async function setup(t) {
  const f = await fixture(t, [
    "supabase/migrations/20260922213246_native_renewal_reminder_storage.sql",
  ]);
  const saved = await run(f.native.save(f.command));
  const client = (actor = 1, bearer = f.bearer) =>
    renewalReminderClient(
      f.url,
      { actor: id(actor), household: id(10) },
      Effect.succeed({ user: { id: id(actor) }, access_token: bearer }),
    );
  const command = {
    operationId: id(960),
    renewalId: id(900),
    expectedRenewalRevision: saved.renewal.revision,
    expectedRevision: null,
    settings: {
      anchor: "cancellation",
      delivery: { enabled: true, recipientIds: [id(1), id(2)], localTime: "08:30", daysBefore: 7 },
    },
  };
  return { ...f, reminders: client(), reminderClient: client, reminderCommand: command };
}
test("reminder native HTTP path recovers lost committed responses and binds the complete intent", async (t) => {
  const f = await setup(t),
    command = f.reminderCommand;
  assert.equal((await run(f.reminders.detail(id(900)))).reminder, null);
  const lost = async (input, init) => {
    const response = await fetch(input, init);
    assert.equal(response.ok, true);
    throw new TypeError("lost response");
  };
  await assert.rejects(
    run(f.reminders.save(command).pipe(Effect.provideService(Fetch.Fetch, lost))),
  );
  const recovery = await run(f.reminders.recover(command));
  assert.equal(recovery.status, "recorded");
  assert.deepEqual(recovery.receipt.command, command);
  assert.deepEqual(await run(f.reminders.save(command)), recovery.receipt);
  assert.deepEqual((await run(f.reminders.detail(id(900)))).reminder, recovery.receipt.reminder);
  assert.deepEqual((await run(f.reminders.cancel(command))).receipt, recovery.receipt);
  await assert.rejects(
    run(f.reminders.recover({ ...command, settings: { ...command.settings, anchor: "renewal" } })),
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("reminder transport refuses foreign callers, stale settings and duplicate queries; cancelled sends stay fenced", async (t) => {
  const f = await setup(t),
    command = f.reminderCommand;
  await assert.rejects(run(f.reminderClient(3, f.otherBearer).save(command)));
  await run(f.reminders.save(command));
  await assert.rejects(run(f.reminders.save({ ...command, operationId: id(961) })));
  const pending = { ...command, operationId: id(962) };
  assert.equal((await run(f.reminders.cancel(pending))).status, "cancelled");
  await assert.rejects(run(f.reminders.save(pending)));
  for (const query of [
    `detail?renewalId=${id(900)}&renewalId=${id(900)}`,
    `operation?operationId=${id(960)}&extra=1`,
  ]) {
    const response = await fetch(`${f.url}/v1/renewal-reminders/${query}`, {
      headers: { authorization: `Bearer ${f.bearer}` },
    });
    assert.equal(response.status, 400);
  }
});
test("reminder client rejects forged receipt ownership, operation and settings", async (t) => {
  const f = await setup(t),
    command = f.reminderCommand;
  const receipt = await run(f.reminders.save(command));
  const changedSettings = {
    ...command.settings,
    delivery: { ...command.settings.delivery, localTime: "09:30" },
  };
  for (const forged of [
    { ...receipt, householdId: id(20) },
    { ...receipt, actorId: id(2), reminder: { ...receipt.reminder, updatedBy: id(2) } },
    { ...receipt, operationId: id(999), command: { ...receipt.command, operationId: id(999) } },
    {
      ...receipt,
      command: { ...receipt.command, settings: changedSettings },
      reminder: { ...receipt.reminder, settings: changedSettings },
    },
  ]) {
    const forgedFetch = () => Promise.resolve(Response.json(forged));
    await assert.rejects(
      run(f.reminders.save(command).pipe(Effect.provideService(Fetch.Fetch, forgedFetch))),
    );
  }
});
