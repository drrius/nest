import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { settlementApprovalOperations } from "../../apps/mobile/src/money/settlement-approval-operations.ts";
import { SettlementApprovalRuntime } from "../../apps/mobile/src/money/settlement-approval-runtime.ts";
import { settlementApiFixture, settlement } from "./settlement-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
for (const approved of [true, false]) {
  test(`settlement ${approved ? "confirm" : "decline"} recovers committed response loss across SQLite reopen while decisions are suspended`, async (t) => {
    const f = await settlementApiFixture(t),
      local = await sqlite(t);
    const account = { actor: id(1), household: id(10) },
      operationId = id(100);
    const approvalId = await f.rpc("nest_propose_action", {
      p_household: id(10),
      p_invocation: operationId,
      p_command: "settlements.record",
      p_version: 1,
      p_payload: settlement({ mode: "partial", amountCentimes: "300" }),
    });
    const session = await run(local.store.activate(account, id(900)));
    const proxy = await lostResponseProxy(t, f.url, "/v1/money/settlement/approval/decide");
    const raw = moneyClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    let sends = 0;
    const client = {
      settlementApproval: (target) =>
        raw.settlementApproval(target).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      decideSettlement: (input) => {
        sends++;
        return raw.decideSettlement(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
    };
    const runtime = new SettlementApprovalRuntime(
      settlementApprovalOperations({ store: local.store, session }, client),
      approvalId,
    );
    await runtime.setOnline(true);
    await runtime.setActive(true);
    await runtime.decide(runtime.getSnapshot().approval, approved);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal(proxy.dropped(), 1);
    assert.equal(sends, 1);
    assert.deepEqual(await run(local.store.readSettlementApproval(session, approvalId)), {
      approvalId,
      operationId,
      approved,
    });
    runtime.dispose();
    suspendDecisions(f.db, approvalId, operationId);
    const reopened = local.reopen();
    const recovered = new SettlementApprovalRuntime(
      settlementApprovalOperations({ store: reopened.store, session }, client),
      approvalId,
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(recovered.getSnapshot().approval.status, approved ? "consumed" : "denied");
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 1);
    assert.equal(await run(reopened.store.readSettlementApproval(session, approvalId)), null);
    assert.equal(f.db.sql("select count(*) from public.financial_events"), approved ? "2" : "1");
    assert.equal(
      reopened.connection.prepare("select count(*) as count from offline_operations").get().count,
      0,
    );
    assert.equal(
      f.db.sql(
        `select sum(receivable_delta_cents) from public.ledger_entries where member_id='${id(1)}'`,
      ),
      approved ? "700" : "1000",
    );
    recovered.dispose();
  });
}

function suspendDecisions(db, approval, operation) {
  db.sql(`revoke all on function public.nest_decide_settlement(uuid,uuid,jsonb,uuid,boolean)
    from public,anon,authenticated,service_role;`);
  for (const approved of [true, false])
    assert.throws(
      () =>
        db.sql(`set role authenticated; set request.jwt.claim.sub='${id(1)}';
      select public.nest_decide_settlement('${id(10)}','${operation}',
      '${JSON.stringify(settlement({ mode: "partial", amountCentimes: "300" }))}'::jsonb,
      '${approval}',${approved})`),
      /permission denied/,
    );
}
