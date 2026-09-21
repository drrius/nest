import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture as sqlite, run } from "../../apps/mobile/tests/offline-fixture.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { correctionEntryOptions } from "../../apps/mobile/src/money/correction-entry-options.ts";
import { correctionSaveOperations } from "../../apps/mobile/src/money/correction-save-operations.ts";
import { CorrectionSaveRuntime } from "../../apps/mobile/src/money/correction-save-runtime.ts";
import {
  initialCorrectionDraft,
  parseCorrectionDraft,
} from "../../apps/mobile/src/money/correction-draft.ts";
import { correctionApiFixture } from "./correction-api-fixture.mjs";
import { id } from "../database/native-expense-helpers.mjs";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
async function fixture(t) {
  const f = await correctionApiFixture(t),
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
  const runtime = new CorrectionSaveRuntime(correctionSaveOperations(account, client));
  await runtime.setOnline(true);
  await runtime.setActive(true);
  t.after(() => runtime.dispose());
  const options = () => run(correctionEntryOptions(account, client, f.source));
  return { ...f, local, account, client, runtime, options };
}
test("native correction entry replaces then reverses through exact review while retaining the original", async (t) => {
  const f = await fixture(t),
    before = f.db.sql(
      `select row_to_json(e) from public.financial_events e where id='${f.source}'`,
    );
  const context = await f.options(),
    draft = initialCorrectionDraft(context);
  const parsed = parseCorrectionDraft(
    { ...draft, amount: "12", firstExact: "5", secondExact: "7" },
    context,
    id(1),
  );
  assert.equal(parsed.ok, true);
  await f.runtime.save({ operationId: id(100), correction: parsed.correction });
  const receipt = f.runtime.getSnapshot().result.receipt;
  assert.equal(receipt.correction.replacement.expense.amountCentimes, "1200");
  assert.equal(
    (await run(f.client.balance())).members.find((m) => m.actorId === id(1)).centimes,
    "700",
  );
  assert.equal(
    f.db.sql(`select row_to_json(e) from public.financial_events e where id='${f.source}'`),
    before,
  );
  f.runtime.acknowledge();
  const next = await run(correctionEntryOptions(f.account, f.client, receipt.replacementEventId));
  const reverse = parseCorrectionDraft(
    { ...initialCorrectionDraft(next), mode: "reverse" },
    next,
    id(1),
  );
  assert.equal(reverse.ok, true);
  await f.runtime.save({ operationId: id(101), correction: reverse.correction });
  assert.equal(f.runtime.getSnapshot().result.status, "recorded");
  assert.equal(
    (await run(f.client.balance())).members.find((m) => m.actorId === id(1)).centimes,
    "0",
  );
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "4");
  assert.equal(await run(f.account.store.readCorrectionSave(f.account.session)), null);
  assert.equal(
    f.local.connection.prepare("select count(*) as n from offline_operations").get().n,
    0,
  );
});
test("a stale correction review cannot overwrite a prior correction and must be cancelled before reviewing the replacement", async (t) => {
  const f = await fixture(t),
    context = await f.options(),
    draft = initialCorrectionDraft(context);
  const reviewed = parseCorrectionDraft(draft, context, id(1)).correction;
  const prior = await run(f.client.saveCorrection({ operationId: id(200), correction: reviewed }));
  await f.runtime.save({ operationId: id(100), correction: reviewed });
  assert.equal(f.runtime.getSnapshot().fresh, false);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
  await f.runtime.refresh();
  assert.equal(f.runtime.getSnapshot().result.status, "unresolved");
  await f.runtime.cancel(f.runtime.getSnapshot().attempt);
  assert.equal(f.runtime.getSnapshot().result.status, "cancelled");
  f.runtime.acknowledge();
  assert.equal(parseCorrectionDraft(draft, await f.options(), id(1)).ok, false);
  const next = await run(correctionEntryOptions(f.account, f.client, prior.replacementEventId));
  const updated = parseCorrectionDraft(
    { ...initialCorrectionDraft(next), mode: "reverse" },
    next,
    id(1),
  );
  await f.runtime.save({ operationId: id(101), correction: updated.correction });
  assert.equal(f.runtime.getSnapshot().result.status, "recorded");
  await assert.rejects(
    run(f.client.saveCorrection({ operationId: id(100), correction: reviewed })),
  );
});
test("correction entry balance is rejected if the local account lease changes during the read", async (t) => {
  const f = await fixture(t);
  const client = {
    correctionContext: () =>
      Effect.gen(function* () {
        const value = yield* f.client.correctionContext(f.source);
        yield* f.local.store.activate({ actor: id(2), household: id(10) }, id(951));
        return value;
      }),
  };
  await assert.rejects(
    run(correctionEntryOptions(f.account, client, f.source)),
    (error) => error.reason === "session_changed",
  );
});
