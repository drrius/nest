import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run, Effect, Fetch } from "./renewal-fixture.mjs";
test("native renewal client recovers lost committed Save and removes only the reviewed revision", async (t) => {
  const f = await fixture(t);
  const lost = async (input, init) => {
    const response = await fetch(input, init);
    assert.equal(response.ok, true);
    throw new TypeError("lost response");
  };
  await assert.rejects(
    run(f.native.save(f.command).pipe(Effect.provideService(Fetch.Fetch, lost))),
  );
  const recovered = await run(f.native.recover(f.command));
  assert.equal(recovered.status, "recorded");
  assert.deepEqual(recovered.receipt.command, f.command);
  assert.deepEqual(await run(f.native.save(f.command)), recovered.receipt);
  assert.equal((await run(f.native.list())).renewals.length, 1);
  const detail = await run(f.native.detail(f.command.renewalId));
  assert.equal(detail.renewal.cancellationOn, "2028-02-29");
  const removal = {
    operationId: id(902),
    renewalId: id(900),
    expectedRevision: detail.renewal.revision,
  };
  const removed = await run(f.native.remove(removal));
  assert.equal(removed.renewal.removed, true);
  assert.equal((await run(f.native.list())).renewals.length, 0);
  assert.equal((await run(f.native.detail(id(900)))).renewal.removed, true);
  assert.deepEqual((await run(f.native.cancel(f.command))).receipt, recovered.receipt);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
test("renewal transport rejects foreign callers, stale edits, duplicate queries and substituted recovery intent", async (t) => {
  const f = await fixture(t);
  await assert.rejects(run(f.client(3, f.otherBearer).save(f.command)));
  const saved = await run(f.native.save(f.command));
  await assert.rejects(run(f.native.save({ ...f.command, operationId: id(902) })));
  await assert.rejects(
    run(f.native.recover({ ...f.command, expectedRevision: saved.renewal.revision })),
  );
  for (const path of [
    `detail?renewalId=${id(900)}&renewalId=${id(900)}`,
    `operation?operationId=${id(901)}&extra=1`,
  ]) {
    const response = await fetch(`${f.url}/v1/renewals/${path}`, {
      headers: { authorization: `Bearer ${f.bearer}` },
    });
    assert.equal(response.status, 400);
  }
  const pending = { ...f.command, operationId: id(905), renewalId: id(906) };
  assert.equal((await run(f.native.cancel(pending))).status, "cancelled");
  await assert.rejects(run(f.native.save(pending)));
});
test("native renewal client rejects substituted receipt ownership and intent", async (t) => {
  const f = await fixture(t);
  const receipt = await run(f.native.save(f.command));
  const variants = [
    { ...receipt, householdId: id(20) },
    { ...receipt, actorId: id(2) },
    { ...receipt, operationId: id(999) },
    {
      ...receipt,
      command: { ...receipt.command, expectedRevision: id(998) },
    },
  ];
  for (const forged of variants) {
    const substitute = async () => Response.json(forged);
    await assert.rejects(
      run(f.native.save(f.command).pipe(Effect.provideService(Fetch.Fetch, substitute))),
    );
  }
  assert.deepEqual(await run(f.native.save(f.command)), receipt);
});
