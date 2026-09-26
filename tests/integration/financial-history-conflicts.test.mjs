import assert from "node:assert/strict";
import { test } from "node:test";
import { correctionApiFixture, correction } from "./correction-api-fixture.mjs";
import { refund } from "./refund-api-fixture.mjs";
import { id } from "../database/native-expense-helpers.mjs";

async function rpc(f, name, fields) {
  const response = await fetch(`${f.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
    body: JSON.stringify({ p_household: id(10), ...fields }),
  });
  return { status: response.status, body: await response.json() };
}

function history(f) {
  return f.db.sql("select jsonb_agg(to_jsonb(e) order by id) from public.financial_events e");
}

for (const { kind, payload } of [
  { kind: "refund", payload: refund },
  { kind: "correction", payload: correction },
]) {
  test(`${kind} cancelled and stale requests return terminal conflicts without adding history`, async (t) => {
    const f = await correctionApiFixture(t);
    const value = payload(f.source);
    const before = history(f);
    assert.equal((await rpc(f, `nest_cancel_${kind}_save`, { p_operation: id(800) })).status, 200);
    const cancelled = await rpc(f, `nest_save_${kind}`, {
      p_operation: id(800),
      p_payload: value,
    });
    assert.equal(cancelled.status, 412, JSON.stringify(cancelled));
    assert.equal(cancelled.body.code, "PT412");
    assert.equal(history(f), before);
    const recorded = await rpc(f, `nest_save_${kind}`, { p_operation: id(801), p_payload: value });
    assert.equal(recorded.status, 200, JSON.stringify(recorded));
    const after = history(f);
    const stale = await rpc(f, `nest_save_${kind}`, { p_operation: id(802), p_payload: value });
    assert.equal(stale.status, 412, JSON.stringify(stale));
    assert.equal(stale.body.code, "PT412");
    assert.equal(history(f), after);
    assert.deepEqual(
      await rpc(f, `nest_save_${kind}`, {
        p_operation: id(801),
        p_payload: value,
      }),
      recorded,
    );
  });
}
