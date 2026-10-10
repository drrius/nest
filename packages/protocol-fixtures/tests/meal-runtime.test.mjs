import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { MealWeekRuntime } from "../src/meals/runtime.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { fixture, account, run } from "./offline-fixture.mjs";
const week = "2026-09-21";
const snapshot = (weekStart = week, revision = "0") => ({
  version: 1,
  householdId: account.household,
  weekStart,
  revision,
  entries: [],
});
const unavailable = Effect.fail(new PreferenceFailure({ code: "unavailable" }));
const bind = (f) => ({ store: f.store, session: f.session });

test("loaded empty weeks are distinct from first-load failure and cache survives refresh failure", async (t) => {
  const f = await fixture(t);
  let response = unavailable;
  const runtime = new MealWeekRuntime({ read: () => response }, bind(f), week);
  await runtime.load();
  assert.equal(runtime.getSnapshot().snapshot, null);
  assert.match(runtime.getSnapshot().notice, /Could not load/);
  response = Effect.succeed(snapshot());
  await runtime.load();
  assert.deepEqual(runtime.getSnapshot().snapshot, snapshot());
  assert.equal(runtime.getSnapshot().fresh, true);
  response = unavailable;
  await runtime.load();
  assert.deepEqual(runtime.getSnapshot().snapshot, snapshot());
  assert.equal(runtime.getSnapshot().fresh, false);
  assert.match(runtime.getSnapshot().notice, /Showing the saved week/);
  runtime.dispose();
});

test("authorization denial hides cached data until an authorized refresh succeeds", async (t) => {
  const f = await fixture(t);
  await run(f.store.saveMealWeek(f.session, snapshot()));
  let response = Effect.fail(new PreferenceFailure({ code: "forbidden" }));
  const runtime = new MealWeekRuntime({ read: () => response }, bind(f), week);
  await runtime.load();
  assert.equal(runtime.getSnapshot().snapshot, null);
  assert.equal(runtime.getSnapshot().access, "verify");
  response = unavailable;
  await runtime.load();
  assert.equal(runtime.getSnapshot().snapshot, null);
  assert.equal(runtime.getSnapshot().access, "verify");
  response = Effect.succeed(snapshot(undefined, "1"));
  await runtime.load();
  assert.equal(runtime.getSnapshot().access, "ready");
  assert.equal(runtime.getSnapshot().snapshot.revision, "1");
  runtime.dispose();
});

test("switching weeks or disposing cancels late reads without caching or publishing them", async (t) => {
  const f = await fixture(t);
  const pending = new Map();
  const client = {
    read: (date) => Effect.promise(() => new Promise((resolve) => pending.set(date, resolve))),
  };
  const runtime = new MealWeekRuntime(client, bind(f), week);
  const first = runtime.load();
  await waitFor(() => pending.has(week));
  const second = runtime.load("2026-09-28");
  await waitFor(() => pending.has("2026-09-28"));
  pending.get("2026-09-28")(snapshot("2026-09-28"));
  await second;
  pending.get(week)(snapshot());
  await first;
  assert.equal(runtime.getSnapshot().snapshot.weekStart, "2026-09-28");
  assert.equal(await run(f.store.readMealWeek(f.session, week)), null);
  const third = runtime.load("2026-10-05");
  await waitFor(() => pending.has("2026-10-05"));
  const before = runtime.getSnapshot();
  runtime.dispose();
  pending.get("2026-10-05")(snapshot("2026-10-05"));
  await third;
  assert.equal(runtime.getSnapshot(), before);
  assert.equal(await run(f.store.readMealWeek(f.session, "2026-10-05")), null);
});
async function waitFor(condition) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail("Deferred read did not start");
}

test("cancelling a queued SQLite save cannot populate or evict a cached week", async (t) => {
  const f = await fixture(t);
  const weeks = [
    "2026-09-21",
    "2026-09-28",
    "2026-10-05",
    "2026-10-12",
    "2026-10-19",
    "2026-10-26",
    "2026-11-02",
    "2026-11-09",
  ];
  for (const date of weeks) await run(f.store.saveMealWeek(f.session, snapshot(date)));
  let resolveRead,
    release,
    entered = false,
    queuedSave = false;
  const waiting = new Promise((resolve) => {
    resolveRead = resolve;
  });
  const store = {
    ...f.store,
    saveMealWeek: (...args) => {
      queuedSave = true;
      return f.store.saveMealWeek(...args);
    },
  };
  const client = {
    read: (date) =>
      date === "2026-09-14" ? Effect.promise(() => waiting) : Effect.succeed(snapshot(date)),
  };
  const runtime = new MealWeekRuntime(client, { store, session: f.session }, "2026-09-14");
  const loading = runtime.load();
  // The network request starts only after the initial cache transaction has completed.
  await waitFor(() => !runtime.getSnapshot().snapshot && runtime.getSnapshot().busy);
  // Flush the queued cache read before acquiring the independent exclusive transaction.
  await f.idle();
  const held = f.database.transaction(async () => {
    entered = true;
    await new Promise((resolve) => {
      release = resolve;
    });
  });
  await waitFor(() => entered);
  try {
    resolveRead(snapshot("2026-09-14"));
    await waitFor(() => queuedSave);
    const next = runtime.load("2026-11-09");
    release();
    await Promise.all([held, loading, next]);
    assert.equal(await run(f.store.readMealWeek(f.session, "2026-09-14")), null);
    assert.deepEqual(await run(f.store.readMealWeek(f.session, weeks[0])), snapshot(weeks[0]));
    assert.equal(f.connection.prepare("select count(*) n from offline_meal_weeks").get().n, 8);
    assert.equal(runtime.getSnapshot().snapshot.weekStart, "2026-11-09");
  } finally {
    release();
    runtime.dispose();
  }
});
