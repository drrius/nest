import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { settlementEntryOptions } from "../../apps/mobile/src/money/settlement-entry-options.ts";
import { settlementSaveOperations } from "../../apps/mobile/src/money/settlement-save-operations.ts";
import { SettlementSaveRuntime } from "../../apps/mobile/src/money/settlement-save-runtime.ts";
import {
  initialSettlementDraft,
  parseSettlementDraft,
} from "../../apps/mobile/src/money/settlement-draft.ts";
import { settlementApiFixture } from "./settlement-api-fixture.mjs";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
async function fixture(t) {
  const f = await settlementApiFixture(t),
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
  const runtime = new SettlementSaveRuntime(settlementSaveOperations(account, client));
  await runtime.setOnline(true);
  await runtime.setActive(true);
  t.after(() => runtime.dispose());
  const options = () => run(settlementEntryOptions(account, client));
  return { ...f, local, account, client, runtime, options };
}
const draft = initialSettlementDraft("2026-09-21");
test("manual native settlement entry derives real debt and records partial then full, retaining original history", async (t) => {
  const f = await fixture(t);
  const original = JSON.parse(f.db.sql("select row_to_json(e) from public.financial_events e"));
  const initial = await f.options();
  const partial = parseSettlementDraft({ ...draft, mode: "partial", amount: "3.01" }, initial);
  assert.equal(partial.ok, true);
  assert.equal(partial.settlement.payerId, id(2));
  assert.equal(partial.settlement.recipientId, id(1));
  await f.runtime.save({ operationId: id(100), settlement: partial.settlement });
  assert.equal(f.runtime.getSnapshot().result.status, "recorded");
  f.runtime.acknowledge();
  const full = parseSettlementDraft(draft, await f.options());
  assert.equal(full.settlement.amountCentimes, "699");
  await f.runtime.save({ operationId: id(101), settlement: full.settlement });
  assert.deepEqual(f.runtime.getSnapshot().result.receipt.settlement, full.settlement);
  const final = await f.options();
  assert.ok(final.members.every((member) => member.centimes === "0"));
  assert.equal(parseSettlementDraft(draft, final).ok, false);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
  assert.deepEqual(
    JSON.parse(
      f.db.sql(`select row_to_json(e) from public.financial_events e where id='${original.id}'`),
    ),
    original,
  );
  assert.equal(await run(f.account.store.readSettlementSave(f.account.session)), null);
  assert.equal(
    f.local.connection.prepare("select count(*) as n from offline_operations").get().n,
    0,
  );
});
test("changed balance rejects the reviewed amount; cancellation and a new review settle only the current debt", async (t) => {
  const f = await fixture(t);
  const reviewed = parseSettlementDraft(draft, await f.options()).settlement;
  await run(
    f.client.saveSettlement({
      operationId: id(200),
      settlement: { ...reviewed, mode: "partial", amountCentimes: "200" },
    }),
  );
  await f.runtime.save({ operationId: id(100), settlement: reviewed });
  assert.equal(f.runtime.getSnapshot().fresh, false);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
  await f.runtime.refresh();
  assert.equal(f.runtime.getSnapshot().result.status, "unresolved");
  await f.runtime.cancel(f.runtime.getSnapshot().attempt);
  assert.equal(f.runtime.getSnapshot().result.status, "cancelled");
  f.runtime.acknowledge();
  const updated = parseSettlementDraft(draft, await f.options()).settlement;
  assert.equal(updated.amountCentimes, "800");
  await f.runtime.save({ operationId: id(101), settlement: updated });
  assert.equal(f.runtime.getSnapshot().result.status, "recorded");
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
  await assert.rejects(
    run(f.client.saveSettlement({ operationId: id(100), settlement: reviewed })),
  );
});
test("settlement entry balance is rejected if the local account lease changes during the read", async (t) => {
  const f = await fixture(t);
  const client = {
    balance: () =>
      Effect.gen(function* () {
        const value = yield* f.client.balance();
        yield* f.local.store.activate({ actor: id(2), household: id(10) }, id(951));
        return value;
      }),
  };
  await assert.rejects(
    run(settlementEntryOptions(f.account, client)),
    (error) => error.reason === "session_changed",
  );
});
