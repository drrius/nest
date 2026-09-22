import test from "node:test";
import assert from "node:assert/strict";
import { fixture, id, run } from "./renewal-fixture.mjs";
import { renewalReadTools } from "../../apps/api/src/renewals/tools.ts";
const invocation = { toolCallId: "renewal-read", messages: [] };
function tools(f, token = f.bearer) {
  return renewalReadTools(
    new Request("http://localhost/", {
      headers: {
        authorization: `Bearer ${token}`,
        "x-nest-household": id(10),
      },
    }),
    { url: f.supabaseUrl, publishableKey: "sb_publishable_fixture" },
  );
}
test("real SDK renewal reads return current authorized records and no writes", async (t) => {
  const f = await fixture(t);
  const receipt = await run(f.native.save(f.command));
  const ai = tools(f);
  const list = await ai.listRenewals.execute({ after: null }, invocation);
  assert.equal(list.ok, true);
  assert.equal(list.value.renewals.length, 1);
  const detail = await ai.readRenewal.execute({ renewalId: f.command.renewalId }, invocation);
  assert.equal(detail.ok, true);
  assert.deepEqual(detail.value.renewal, receipt.renewal);
  const foreign = await tools(f, f.otherBearer).readRenewal.execute(
    { renewalId: f.command.renewalId },
    invocation,
  );
  assert.equal(foreign.ok, false);
  const injected = await ai.readRenewal.execute(
    { renewalId: f.command.renewalId, householdId: id(20) },
    invocation,
  );
  assert.equal(injected.ok, false);
  assert.equal(f.db.sql("select count(*) from private.nest_renewal_operations"), "1");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "0");
});
