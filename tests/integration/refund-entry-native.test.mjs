import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { refundEntryOptions } from "../../apps/mobile/src/money/refund-entry-options.ts";
import { refundSaveOperations } from "../../apps/mobile/src/money/refund-save-operations.ts";
import { RefundSaveRuntime } from "../../apps/mobile/src/money/refund-save-runtime.ts";
import { initialRefundDraft, parseRefundDraft } from "../../apps/mobile/src/money/refund-draft.ts";
import { refundApiFixture } from "./refund-api-fixture.mjs";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
async function fixture(t) {
  const f = await refundApiFixture(t),
    local = await sqlite(t);
  const identity = { actor: id(1), household: id(10) };
  const session = await run(local.store.activate(identity, id(950)));
  const account = { store: local.store, session };
  const raw = moneyClient(
    f.url,
    identity,
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
  const client = Object.fromEntries(
    Object.entries(raw).map(([key, method]) => [
      key,
      (...args) => method(...args).pipe(Effect.provideService(Fetch.Fetch, fetch)),
    ]),
  );
  const runtime = new RefundSaveRuntime(refundSaveOperations(account, client));
  await runtime.setOnline(true);
  await runtime.setActive(true);
  t.after(() => runtime.dispose());
  const options = () => run(refundEntryOptions(account, client, f.source));
  return { ...f, local, account, client, runtime, options };
}
const draft = initialRefundDraft("2026-09-21");
test("manual native refund entry derives real refundable shares and records partial then full, retaining original history", async (t) => {
  const f = await fixture(t);
  const original = JSON.parse(f.db.sql("select row_to_json(e) from public.financial_events e"));
  const initial = await f.options();
  const partial = parseRefundDraft(
    { ...draft, mode: "partial", own: "1", partner: "2.01" },
    initial,
    id(1),
  );
  assert.equal(partial.ok, true);
  assert.equal(partial.refund.payerId, id(1));
  await f.runtime.save({ operationId: id(100), refund: partial.refund });
  assert.equal(f.runtime.getSnapshot().result.status, "recorded");
  f.runtime.acknowledge();
  const full = parseRefundDraft(draft, await f.options(), id(1));
  assert.equal(full.refund.amountCentimes, "699");
  await f.runtime.save({ operationId: id(101), refund: full.refund });
  assert.deepEqual(f.runtime.getSnapshot().result.receipt.refund, full.refund);
  const final = await f.options();
  assert.ok(final.remaining.every((member) => member.centimes === "0"));
  assert.equal(parseRefundDraft(draft, final, id(1)).ok, false);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
  assert.deepEqual(
    JSON.parse(
      f.db.sql(`select row_to_json(e) from public.financial_events e where id='${original.id}'`),
    ),
    original,
  );
  assert.equal(await run(f.account.store.readRefundSave(f.account.session)), null);
  assert.equal(
    f.local.connection.prepare("select count(*) as n from offline_operations").get().n,
    0,
  );
});
test("changed refundable shares rejects the reviewed amount; cancellation and a new review settle only the current remaining shares", async (t) => {
  const f = await fixture(t);
  const reviewed = parseRefundDraft(draft, await f.options(), id(1)).refund;
  await run(
    f.client.saveRefund({
      operationId: id(200),
      refund: {
        ...reviewed,
        amountCentimes: "200",
        allocations: [
          { memberId: id(1), centimes: "0" },
          { memberId: id(2), centimes: "200" },
        ],
      },
    }),
  );
  await f.runtime.save({ operationId: id(100), refund: reviewed });
  assert.equal(f.runtime.getSnapshot().fresh, false);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  await f.runtime.refresh();
  assert.equal(f.runtime.getSnapshot().result.status, "unresolved");
  await f.runtime.cancel(f.runtime.getSnapshot().attempt);
  assert.equal(f.runtime.getSnapshot().result.status, "cancelled");
  f.runtime.acknowledge();
  const updated = parseRefundDraft(draft, await f.options(), id(1)).refund;
  assert.equal(updated.amountCentimes, "800");
  await f.runtime.save({ operationId: id(101), refund: updated });
  assert.equal(f.runtime.getSnapshot().result.status, "recorded");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
  await assert.rejects(run(f.client.saveRefund({ operationId: id(100), refund: reviewed })));
});
test("refund entry balance is rejected if the local account lease changes during the read", async (t) => {
  const f = await fixture(t);
  const client = {
    refundContext: () =>
      Effect.gen(function* () {
        const value = yield* f.client.refundContext(f.source);
        yield* f.local.store.activate({ actor: id(2), household: id(10) }, id(951));
        return value;
      }),
  };
  await assert.rejects(
    run(refundEntryOptions(f.account, client, f.source)),
    (error) => error.reason === "session_changed",
  );
});
