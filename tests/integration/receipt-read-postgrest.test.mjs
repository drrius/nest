import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { createHandler } from "../../apps/api/src/handler.ts";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { files, id } from "../database/expense-receipt-fixture.mjs";
import { moneyClient } from "../../packages/protocol-fixtures/src/money/client.ts";
import { payload } from "../database/native-expense-helpers.mjs";
const require = createRequire(
  new URL("../../packages/protocol-fixtures/package.json", import.meta.url),
);
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
async function receiptFixture(t) {
  const f = await postgrestFixture(t, [
    ...files,
    "supabase/migrations/20260921170517_native_receipt_read.sql",
    "tests/integration/food-postgrest.sql",
  ]);
  const path = `${id(10)}/receipts/${id(100)}.jpg`;
  f.db.sql(
    `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.reserve_household_attachment('${path}','image/jpeg')`,
  );
  f.db.sql(
    `insert into storage.objects(bucket_id,name,metadata) values('household-files','${path}','{"mimetype":"image/jpeg","size":128}')`,
  );
  const server = nodeServer(
    createHandler({ url: f.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
  const connect = (actor, token) =>
    moneyClient(
      url,
      { actor, household: id(10) },
      Effect.succeed({ user: { id: actor }, access_token: token }),
      { origin: f.url },
    );
  const first = connect(id(1), f.bearer),
    second = connect(id(2), f.partnerBearer);
  return { ...f, path, url, run, first, second };
}

function retainedRecords(db) {
  return db.sql(`select jsonb_build_object(
    'events',(select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e),
    'allocations',(select jsonb_agg(to_jsonb(a) order by id) from public.financial_allocations a),
    'ledger',(select jsonb_agg(to_jsonb(l) order by id) from public.ledger_entries l),
    'uploads',(select jsonb_agg(to_jsonb(u) order by path) from public.household_attachment_uploads u),
    'objects',(select jsonb_agg(to_jsonb(o) order by id) from storage.objects o))`);
}

test("receipt metadata passes actual API and RLS before and after financial claim", async (t) => {
  const f = await receiptFixture(t);
  const { path, url, run, first, second } = f;
  assert.equal((await run(first.receipt({ receiptPath: path }))).receipt.path, path);
  await assert.rejects(run(second.receipt({ receiptPath: path })), { code: "forbidden" });
  const saved = await run(
    first.saveExpense({ operationId: id(200), expense: payload({ receiptPath: path }) }),
  );
  const target = { eventId: saved.eventId };
  for (const client of [first, second]) {
    const result = await run(client.receipt(target));
    assert.equal(result.receipt.path, path);
    assert.deepEqual(result.target, target);
  }
  for (const query of [
    `eventId=${saved.eventId}&receiptPath=${path}`,
    `eventId=${saved.eventId}&eventId=${saved.eventId}`,
  ]) {
    const response = await fetch(`${url}/v1/money/receipt?${query}`, {
      headers: { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) },
    });
    assert.equal(response.status, 400);
  }
  // No Storage HTTP server is faked as success: signing is unavailable in this fixture.
  await assert.rejects(run(first.receiptLink(target)), { code: "unavailable" });
  const retained = retainedRecords(f.db);
  assert.throws(
    () => f.db.sql(`delete from public.household_members where user_id='${id(1)}'`),
    /financial_events_household_id_created_by_member_id_fkey/,
  );
  for (const client of [first, second]) {
    assert.equal((await run(client.receipt(target))).receipt.path, path);
  }
  assert.equal(retainedRecords(f.db), retained);
});

test("removed unposted uploader cannot read metadata or request links with cached credentials", async (t) => {
  const f = await receiptFixture(t);
  const target = { receiptPath: f.path };
  assert.equal((await f.run(f.first.receipt(target))).receipt.path, f.path);
  const retained = retainedRecords(f.db);
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  for (const token of [f.bearer, f.freshBearer]) {
    for (const route of ["receipt", "receipt/link"]) {
      const response = await fetch(`${f.url}/v1/money/${route}?receiptPath=${f.path}`, {
        headers: { authorization: `Bearer ${token}`, "x-nest-household": id(10) },
      });
      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), { error: { code: "not_a_member" } });
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  }
  assert.throws(
    () =>
      f.db.sql(
        `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.nest_read_receipt('${id(10)}',null,'${f.path}')`,
      ),
    /Not authorized/,
  );
  await assert.rejects(f.run(f.second.receipt(target)), { code: "forbidden" });
  assert.equal(retainedRecords(f.db), retained);
});
