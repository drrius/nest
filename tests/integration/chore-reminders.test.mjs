import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect, Fetch } from "./chore-reminder-fixture.mjs";
test("chore reminder native HTTP recovers a lost committed response and refuses substituted intent", async (t) => {
  const f = await fixture(t),
    command = f.command;
  assert.equal((await run(f.native.detail(f.occurrenceId))).reminder, null);
  const lost = async (input, init) => {
    const response = await fetch(input, init);
    assert.equal(response.status, 200);
    throw new TypeError("lost response");
  };
  await assert.rejects(run(f.native.save(command).pipe(Effect.provideService(Fetch.Fetch, lost))));
  const result = await run(f.native.recover(command));
  assert.equal(result.status, "recorded");
  assert.deepEqual(result.receipt.command, command);
  assert.deepEqual(await run(f.native.save(command)), result.receipt);
  assert.deepEqual((await run(f.native.cancel(command))).receipt, result.receipt);
  await assert.rejects(
    run(f.native.recover({ ...command, settings: { ...command.settings, localTime: "12:00" } })),
  );
  assert.equal(f.db.sql("select count(*) from private.nest_chore_reminder_operations"), "1");
});
test("chore reminder transport rejects foreign and stale writes, query injection and cancelled sends", async (t) => {
  const f = await fixture(t),
    command = f.command;
  await assert.rejects(run(f.client(3, f.otherBearer).save(command)), { code: "forbidden" });
  await run(f.native.save(command));
  await assert.rejects(run(f.native.save({ ...command, operationId: id(2001) })), {
    code: "conflict",
  });
  const cancelled = { ...command, operationId: id(2002) };
  assert.equal((await run(f.native.cancel(cancelled))).status, "cancelled");
  await assert.rejects(run(f.native.save(cancelled)));
  for (const query of [
    `detail?occurrenceId=${f.occurrenceId}&occurrenceId=${f.occurrenceId}`,
    `operation?operationId=${id(2000)}&extra=1`,
  ]) {
    const response = await fetch(`${f.url}/v1/chore-reminders/${query}`, {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    });
    assert.equal(response.status, 400);
  }
});
test("chore reminder native client rejects forged ownership, receipt intent and target context", async (t) => {
  const f = await fixture(t),
    command = f.command;
  const receipt = await run(f.native.save(command));
  const settings = { ...command.settings, localTime: "12:00" };
  for (const forged of [
    { ...receipt, householdId: id(20) },
    { ...receipt, actorId: id(2), reminder: { ...receipt.reminder, updatedBy: id(2) } },
    { ...receipt, operationId: id(999), command: { ...command, operationId: id(999) } },
    { ...receipt, command: { ...command, settings }, reminder: { ...receipt.reminder, settings } },
  ])
    await assert.rejects(
      run(
        f.native
          .save(command)
          .pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(forged))),
      ),
      { code: "unavailable" },
    );
  const context = await run(f.native.detail(f.occurrenceId));
  const forged = { ...context, chore: { ...context.chore, occurrenceId: id(999) }, reminder: null };
  await assert.rejects(
    run(
      f.native
        .detail(f.occurrenceId)
        .pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(forged))),
    ),
    { code: "unavailable" },
  );
});
