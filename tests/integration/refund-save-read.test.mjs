import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { refundApiFixture } from "./refund-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { refundSaveTool } from "../../apps/api/src/money/refund-save-tool.ts";
import { id } from "../database/native-expense-helpers.mjs";
import { refund } from "./refund-api-fixture.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
const client = (f, actor = id(1), token = f.bearer, url = f.url) =>
  moneyClient(
    url,
    { actor, household: id(10) },
    Effect.succeed({ user: { id: actor }, access_token: token }),
  );
const commandFor = (f) => ({ operationId: id(100), refund: refund(f.source) });
test("native and SDK Save recovery read a lost committed receipt without reposting or leaking to a partner", async (t) => {
  const f = await refundApiFixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/refund/save");
  const command = commandFor(f);
  const native = client(f, id(1), f.bearer, proxy.url);
  assert.equal((await run(native.recoverRefund(command))).status, "unresolved");
  await assert.rejects(run(native.saveRefund(command)), { code: "unavailable" });
  const { receipt } = await run(client(f).recoverRefund(command));
  assert.equal(receipt.operationId, command.operationId);
  assert.equal(receipt.approvalId, null);
  assert.equal(
    (await run(client(f, id(2), f.partnerBearer).recoverRefund(command))).status,
    "unresolved",
  );
  const request = new Request(f.url, {
    headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
  });
  const tool = refundSaveTool(request, {
    url: f.supabaseUrl,
    publishableKey: "sb_publishable_fixture",
  });
  const value = await tool.execute(
    { operationId: command.operationId },
    { toolCallId: "recover", messages: [] },
  );
  assert.equal(value.ok, true);
  assert.deepEqual(value.value.receipt, receipt);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  const headers = { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) };
  assert.equal(
    (
      await fetch(`${f.url}/v1/money/refund/receipt?operationId=${id(100)}&actorId=${id(2)}`, {
        headers,
      })
    ).status,
    400,
  );
  const readUrl = `${f.url}/v1/money/refund/receipt?operationId=${id(100)}`;
  assert.equal((await fetch(readUrl, { method: "POST", headers })).status, 405);
  assert.equal((await fetch(readUrl, { headers })).headers.get("cache-control"), "no-store");
  assert.equal((await fetch(`${readUrl}&operationId=${id(100)}`, { headers })).status, 400);
  const denied = await fetch(
    `${f.supabaseUrl}/rest/v1/nest_refund_receipts?select=result&operation_id=eq.${id(100)}`,
    { headers: { authorization: `Bearer ${f.partnerBearer}` } },
  );
  assert.deepEqual(await denied.json(), []);
  assert.equal(proxy.dropped(), 1);
});
async function waitFor(db, condition) {
  for (let count = 0; count < 100; count++) {
    if (db.sql(`select count(*) from pg_stat_activity where ${condition}`) !== "0") return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw Error("Expected database wait did not occur");
}
test("missing receipt during a blocked Save is not a terminal failure; later recovery sees the single commit", async (t) => {
  const f = await refundApiFixture(t),
    native = client(f),
    command = commandFor(f);
  const holder = f.db.concurrent(
    `set application_name='save-recovery-holder'; begin; select private.lock_household_ledger('${id(10)}'); select pg_sleep(1.5); commit;`,
  );
  await waitFor(f.db, "application_name='save-recovery-holder' and wait_event='PgSleep'");
  const saving = run(native.saveRefund(command));
  await waitFor(f.db, "query like '%nest_save_refund%' and wait_event='advisory'");
  assert.equal((await run(native.recoverRefund(command))).status, "unresolved");
  await holder;
  const receipt = await saving;
  assert.deepEqual((await run(native.recoverRefund(command))).receipt, receipt);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
});
test("revoked membership cannot recover even a missing Save receipt", async (t) => {
  const f = await refundApiFixture(t, false),
    native = client(f),
    command = commandFor(f);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  await assert.rejects(run(native.recoverRefund(command)), { code: "forbidden" });
});

test("lost cancellation acknowledgement recovers a permanent outcome and blocks a late Save", async (t) => {
  const f = await refundApiFixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/refund/cancel");
  const command = commandFor(f);
  await assert.rejects(run(client(f, id(1), f.bearer, proxy.url).cancelRefund(command)), {
    code: "unavailable",
  });
  const native = client(f);
  assert.equal((await run(native.recoverRefund(command))).status, "cancelled");
  await assert.rejects(run(native.saveRefund(command)), { code: "conflict" });
  assert.equal((await run(native.cancelRefund(command))).status, "cancelled");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "1");
  assert.equal(proxy.dropped(), 1);
});
test("cancelling after a lost Save returns the recorded receipt without reversing history", async (t) => {
  const f = await refundApiFixture(t),
    proxy = await lostResponseProxy(t, f.url, "/v1/money/refund/save");
  const command = commandFor(f);
  await assert.rejects(run(client(f, id(1), f.bearer, proxy.url).saveRefund(command)), {
    code: "unavailable",
  });
  const result = await run(client(f).cancelRefund(command));
  assert.equal(result.status, "recorded");
  assert.deepEqual(result.receipt.refund, command.refund);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  assert.equal(f.db.sql("select count(*) from public.nest_refund_save_cancellations"), "0");
});
