import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { MoneyReadRuntime } from "../src/money/read-runtime.ts";
import { moneyReadOperations } from "../src/money/read-operations.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { OfflineFailure } from "../src/offline/contracts.ts";
import { fixture, run, account } from "./offline-fixture.mjs";
import { id, balance, history } from "./money-cache-fixture.mjs";
const unavailable = () => Effect.fail(new PreferenceFailure({ code: "unavailable" }));
function operations(overrides = {}) {
  return {
    cached: () => Effect.succeed(balance),
    remote: () => Effect.succeed(balance),
    save: (entry) => Effect.succeed(entry),
    clear: () => Effect.void,
    ...overrides,
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("Money shows saved data on refresh failure and recovers a confirmed online read", async () => {
  let online = false,
    saved = 0;
  const runtime = new MoneyReadRuntime(
    operations({
      remote: () => (online ? Effect.succeed(balance) : unavailable()),
      save: (entry) =>
        Effect.sync(() => {
          saved++;
          return entry;
        }),
    }),
    { kind: "balance" },
  );
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().source, "saved");
  assert.match(runtime.getSnapshot().notice, /Could not refresh/);
  assert.deepEqual(runtime.getSnapshot().entry, balance);
  online = true;
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().source, "online");
  assert.equal(runtime.getSnapshot().notice, null);
  assert.equal(saved, 1);
  runtime.dispose();
});
test("corrupt cache can repair online and failed persistence retains the loaded view in memory", async () => {
  let online = true;
  const runtime = new MoneyReadRuntime(
    operations({
      cached: () => Effect.fail(new OfflineFailure({ reason: "storage" })),
      remote: () => (online ? Effect.succeed(balance) : unavailable()),
      save: () => Effect.fail(new OfflineFailure({ reason: "storage" })),
    }),
    { kind: "balance" },
  );
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().source, "online");
  assert.match(runtime.getSnapshot().notice, /could not save/);
  online = false;
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().source, "previous");
  assert.deepEqual(runtime.getSnapshot().entry, balance);
  runtime.dispose();
});
test("target changes cancel old reads and background/dispose clear visible financial data", async () => {
  const pending = deferred(),
    started = deferred();
  const second = { ...history, value: { ...history.value, before: id(200) } };
  let saves = 0;
  const runtime = new MoneyReadRuntime(
    operations({
      cached: () => Effect.succeed(null),
      remote: (target) =>
        target.before === null
          ? Effect.promise(() => {
              started.resolve();
              return pending.promise;
            })
          : Effect.succeed(second),
      save: (entry) =>
        Effect.sync(() => {
          saves++;
          return entry;
        }),
    }),
    { kind: "history", before: null },
  );
  const old = runtime.setActive(true);
  await started.promise;
  await runtime.changeTarget({ kind: "history", before: id(200) });
  pending.resolve(history);
  await old;
  assert.deepEqual(runtime.getSnapshot().entry, second);
  assert.equal(saves, 1);
  await runtime.setActive(false);
  assert.equal(runtime.getSnapshot().entry, null);
  assert.equal(runtime.getSnapshot().busy, false);
  runtime.dispose();
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().entry, null);
});
test("access denial clears saved data and blocks automatic retries until account verification", async () => {
  let clears = 0,
    reads = 0;
  const runtime = new MoneyReadRuntime(
    operations({
      remote: () => {
        reads++;
        return Effect.fail(new PreferenceFailure({ code: "forbidden" }));
      },
      clear: () =>
        Effect.sync(() => {
          clears++;
        }),
    }),
    { kind: "balance" },
  );
  await runtime.setActive(true);
  assert.equal(runtime.getSnapshot().access, "verify");
  assert.equal(runtime.getSnapshot().entry, null);
  assert.equal(clears, 1);
  await runtime.refresh();
  await runtime.setActive(false);
  await runtime.setActive(true);
  assert.equal(reads, 1);
  runtime.dispose();
});
test("Money operations reject an old lease before networking and a replaced lease after a delayed read", async (t) => {
  const f = await fixture(t),
    pending = deferred(),
    started = deferred();
  let reads = 0;
  const client = {
    balance: () =>
      Effect.promise(() => {
        reads++;
        started.resolve();
        return pending.promise;
      }),
    history: () => unavailable(),
    detail: () => unavailable(),
  };
  const ops = moneyReadOperations(
    { store: f.store, session: f.session },
    client,
    () => balance.savedAt,
  );
  const inFlight = run(ops.remote({ kind: "balance" }));
  await started.promise;
  await run(f.store.activate({ ...account, actor: id(2) }, id(500)));
  pending.resolve(balance.value);
  await assert.rejects(inFlight, { reason: "session_changed" });
  await assert.rejects(run(ops.remote({ kind: "balance" })), { reason: "session_changed" });
  assert.equal(reads, 1);
  assert.equal(f.connection.prepare("select count(*) n from offline_money_reads").get().n, 0);
});

test("one denied Money section immediately clears its sibling and strict-mode owner resubscription starts fresh", async () => {
  const { moneyReadOwner } = await import("../src/money/read-owner.ts");
  const pending = deferred(),
    started = deferred();
  const owner = moneyReadOwner(
    operations({
      cached: () => Effect.succeed(balance),
      remote: (target) =>
        target.kind === "balance"
          ? Effect.promise(() => {
              started.resolve();
              return pending.promise;
            })
          : Effect.fail(new PreferenceFailure({ code: "forbidden" })),
    }),
    [{ kind: "balance" }, { kind: "history", before: null }],
  );
  const stop = owner.subscribe(() => {}),
    group = owner.getSnapshot();
  const first = group[0].setActive(true);
  await started.promise;
  await group[1].setActive(true);
  await first;
  assert.equal(group[0].getSnapshot().access, "verify");
  assert.equal(group[0].getSnapshot().entry, null);
  pending.resolve(balance);
  stop();
  assert.equal(owner.getSnapshot(), null);
  const release = owner.subscribe(() => {}),
    replacement = owner.getSnapshot();
  assert.notEqual(replacement[0], group[0]);
  assert.equal(replacement[0].getSnapshot().access, "ready");
  release();
});
