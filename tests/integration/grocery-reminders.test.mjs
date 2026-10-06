import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect, Fetch } from "./grocery-reminder-fixture.mjs";
test("shared grocery reminder reads do not expose another actor's operation receipt", async (t) => {
  const f = await fixture(t);
  const receipt = await run(f.native.save(f.command));
  const partner = f.client(2, f.partnerBearer);
  assert.deepEqual((await run(partner.detail(f.itemId))).reminder, receipt.reminder);
  const hidden = await run(partner.recover(f.command));
  assert.deepEqual(hidden, {
    version: 1,
    actorId: id(2),
    householdId: id(10),
    operationId: f.command.operationId,
    status: "unresolved",
    receipt: null,
  });
  assert.deepEqual((await run(f.native.recover(f.command))).receipt, receipt);
  assert.equal(f.db.sql("select count(*) from private.nest_grocery_reminder_operations"), "1");
  for (const [bearer, household, status] of [
    [f.otherBearer, id(10), 403],
    [f.bearer, id(20), 403],
    [null, id(10), 401],
  ]) {
    const headers = { "x-nest-household": household };
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    const response = await fetch(
      `${f.url}/v1/grocery-reminders/operation?operationId=${f.command.operationId}`,
      { headers },
    );
    assert.equal(response.status, status);
    const body = await response.text();
    assert.equal(body.includes(receipt.reminder.revision), false);
    assert.equal(body.includes(f.command.operationId), false);
  }
  assert.equal(f.db.sql("select count(*) from private.nest_grocery_reminder_operations"), "1");
});
test("grocery reminder native HTTP recovers a lost committed response and refuses substituted intent", async (t) => {
  const f = await fixture(t),
    command = f.command;
  assert.equal((await run(f.native.detail(f.itemId))).reminder, null);
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
  assert.equal(f.db.sql("select count(*) from private.nest_grocery_reminder_operations"), "1");
});
test("grocery reminder transport rejects foreign and stale writes, query injection and cancelled sends", async (t) => {
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
    `detail?itemId=${f.itemId}&itemId=${f.itemId}`,
    `operation?operationId=${id(2000)}&extra=1`,
  ]) {
    const response = await fetch(`${f.url}/v1/grocery-reminders/${query}`, {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    });
    assert.equal(response.status, 400);
  }
});
test("grocery reminder native client rejects forged ownership, receipt intent and target context", async (t) => {
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
  const context = await run(f.native.detail(f.itemId));
  const forged = { ...context, grocery: { ...context.grocery, itemId: id(999) }, reminder: null };
  await assert.rejects(
    run(
      f.native
        .detail(f.itemId)
        .pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(forged))),
    ),
    { code: "unavailable" },
  );
});
