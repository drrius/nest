import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { refundApprovalOperations } from "../../apps/mobile/src/money/refund-approval-operations.ts";
import { RefundApprovalRuntime } from "../../apps/mobile/src/money/refund-approval-runtime.ts";
import { refundApiFixture, refund } from "./refund-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
for (const approved of [true, false]) {
  test(`refund ${approved ? "confirm" : "decline"} recovers committed response loss across SQLite reopen with no automatic write`, async (t) => {
    const f = await refundApiFixture(t),
      local = await sqlite(t);
    const account = { actor: id(1), household: id(10) },
      operationId = id(100);
    const approvalId = await f.rpc("nest_propose_action", {
      p_household: id(10),
      p_invocation: operationId,
      p_command: "expenses.refund",
      p_version: 1,
      p_payload: refund(f.source),
    });
    const session = await run(local.store.activate(account, id(900)));
    const proxy = await lostResponseProxy(t, f.url, "/v1/money/refund/approval/decide");
    const raw = moneyClient(
      proxy.url,
      account,
      Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
    );
    let sends = 0;
    const client = {
      refundApproval: (target) =>
        raw.refundApproval(target).pipe(Effect.provideService(Fetch.Fetch, fetch)),
      decideRefund: (input) => {
        sends++;
        return raw.decideRefund(input).pipe(Effect.provideService(Fetch.Fetch, fetch));
      },
    };
    const runtime = new RefundApprovalRuntime(
      refundApprovalOperations({ store: local.store, session }, client),
      approvalId,
    );
    await runtime.setOnline(true);
    await runtime.setActive(true);
    await runtime.decide(runtime.getSnapshot().approval, approved);
    assert.equal(runtime.getSnapshot().fresh, false);
    assert.equal(proxy.dropped(), 1);
    assert.equal(sends, 1);
    assert.deepEqual(await run(local.store.readRefundApproval(session, approvalId)), {
      approvalId,
      operationId,
      approved,
    });
    runtime.dispose();
    const reopened = local.reopen();
    const recovered = new RefundApprovalRuntime(
      refundApprovalOperations({ store: reopened.store, session }, client),
      approvalId,
    );
    await recovered.setOnline(true);
    await recovered.setActive(true);
    assert.equal(recovered.getSnapshot().approval.status, approved ? "consumed" : "denied");
    assert.equal(recovered.getSnapshot().attempt, null);
    assert.equal(sends, 1);
    assert.equal(await run(reopened.store.readRefundApproval(session, approvalId)), null);
    assert.equal(f.db.sql("select count(*) from public.financial_events"), approved ? "2" : "1");
    assert.equal(
      reopened.connection.prepare("select count(*) as count from offline_operations").get().count,
      0,
    );
    assert.equal(
      f.db.sql(
        `select sum(receivable_delta_cents) from public.ledger_entries where member_id='${id(1)}'`,
      ),
      approved ? "400" : "600",
    );
    recovered.dispose();
  });
}
