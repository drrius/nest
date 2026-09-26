import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { pushWorkerFixture } from "./push-worker-fixture.mjs";
import { id } from "../database/push-delivery-fixture.mjs";

test("closed push attempts reject late results without losing exact successful acknowledgments", async (t) => {
  const f = await pushWorkerFixture(t),
    delivery = f.prepare(),
    attempt = f.begin(delivery).attemptId;
  const send = {
    p_delivery: delivery,
    p_attempt: attempt,
    p_result: { status: "ticket", ticketId: "conflict-ticket" },
  };
  const receipt = {
    p_delivery: delivery,
    p_attempt: attempt,
    p_ticket: "conflict-ticket",
    p_result: { status: "accepted" },
  };
  const state = () =>
    f.db.sql(`select jsonb_build_object(
    'deliveries',(select jsonb_agg(to_jsonb(d) order by id) from private.nest_push_deliveries d),
    'send',(select jsonb_agg(to_jsonb(s) order by attempt_id) from private.nest_push_send_results s),
    'receipt',(select jsonb_agg(to_jsonb(r) order by attempt_id) from private.nest_push_receipt_results r))`);
  f.db.sql(`update private.nest_push_deliveries set state='cancelled' where id='${delivery}'`);
  const closed = state();
  assert.equal((await rpc(f, "nest_finish_push_send", send)).status, 412);
  assert.equal(state(), closed);
  f.db.sql(`update private.nest_push_deliveries set state='sending' where id='${delivery}'`);
  const sent = await rpc(f, "nest_finish_push_send", send);
  assert.equal(sent.status, 200);
  f.db.sql(`update private.nest_push_deliveries set state='cancelled' where id='${delivery}'`);
  const awaiting = state();
  assert.equal((await rpc(f, "nest_finish_push_receipt", receipt)).status, 412);
  assert.equal(state(), awaiting);
  f.db.sql(`update private.nest_push_deliveries set state='ticket' where id='${delivery}'`);
  const accepted = await rpc(f, "nest_finish_push_receipt", receipt);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await rpc(f, "nest_finish_push_send", send), sent);
  assert.deepEqual(await rpc(f, "nest_finish_push_receipt", receipt), accepted);
});
async function rpc(f, name, input, server = true) {
  const response = await fetch(`${f.http.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(server ? { apikey: f.http.serverKey } : { authorization: `Bearer ${f.http.bearer}` }),
    },
    body: JSON.stringify(input),
  });
  return { status: response.status, body: await response.json() };
}
test("all push checkpoints reject an obsolete revision and preserve committed progress", async (t) => {
  const f = await pushWorkerFixture(t);
  for (const prefix of ["", "summary_", "chore_", "meal_", "grocery_", "recurring_"]) {
    const read = `nest_read_${prefix}push_checkpoint`,
      save = `nest_save_${prefix}push_checkpoint`;
    const first = await rpc(f, read, {});
    assert.equal(first.status, 200);
    const saved = await rpc(f, save, { p_revision: first.body.revision, p_after: null });
    assert.equal(saved.status, 200);
    const stale = await rpc(f, save, { p_revision: first.body.revision, p_after: null });
    assert.equal(stale.status, 412, JSON.stringify(stale));
    assert.equal(stale.body.code, "PT412");
    assert.deepEqual(await rpc(f, read, {}), saved);
    assert.ok(
      [401, 403].includes(
        (await rpc(f, save, { p_revision: saved.body.revision, p_after: null }, false)).status,
      ),
    );
  }
  await assert.rejects(
    Effect.runPromise(f.rpc("saveCheckpoint", { p_revision: id(999), p_after: null })),
    { code: "conflict" },
  );
});
test("cancelled enrollment and stale device versions preserve registration and receipts", async (t) => {
  const f = await pushWorkerFixture(t);
  f.db.file("tests/integration/food-postgrest.sql");
  const input = {
    action: "register",
    operationId: id(1800),
    installationId: id(1702),
    expectedRevision: null,
    token: "ExponentPushToken[ChangedFixture]",
  };
  const snapshot = () =>
    f.db.sql(`select jsonb_build_object(
    'devices',(select jsonb_agg(to_jsonb(d) order by installation_id) from private.nest_push_devices d),
    'operations',(select jsonb_agg(to_jsonb(o) order by operation_id) from private.nest_push_device_operations o))`);
  const before = snapshot();
  const stale = await rpc(
    f,
    "nest_save_push_device",
    { p_household: id(10), p_input: input },
    false,
  );
  assert.equal(stale.status, 412, JSON.stringify(stale));
  assert.equal(snapshot(), before);
  f.db.sql(
    `insert into private.nest_push_cancelled_operations values('${id(1)}','${id(10)}','${id(1800)}')`,
  );
  const cancelled = await rpc(
    f,
    "nest_save_push_device",
    { p_household: id(10), p_input: input },
    false,
  );
  assert.equal(cancelled.status, 412, JSON.stringify(cancelled));
  assert.equal(snapshot(), before);
});
