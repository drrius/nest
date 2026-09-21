import assert from "node:assert/strict";
import test from "node:test";
import * as Effect from "effect/Effect";
import { fixture, run, account } from "./offline-fixture.mjs";
import { idle, deferred, setup as personalAgenda } from "./calendar-agenda-runtime-fixture.mjs";
import { PartnerRuntime } from "../src/calendar/partner-runtime.ts";
import { partnerOperations } from "../src/calendar/partner-operations.ts";
import { partnerAgenda } from "../src/calendar/partner-agenda.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const now = 1800000000000;
const snapshot = (fields = {}) => ({
  actorId: id(2),
  schemaVersion: 1,
  consent: "1",
  generation: "1",
  capturedAt: new Date(now).toISOString(),
  expiresAt: new Date(now + 900000).toISOString(),
  covered: { start: now, end: now + 86400000 },
  intervals: [{ start: now + 100, end: now + 200 }],
  ...fields,
});
async function setup(t) {
  const f = await fixture(t);
  const state = { value: [snapshot()], time: now, error: null, pending: null };
  const client = {
    snapshots: () =>
      Effect.gen(function* () {
        if (state.pending) yield* Effect.promise(() => state.pending.promise);
        if (state.error) return yield* new PreferenceFailure({ code: state.error });
        return state.value;
      }),
  };
  const operations = partnerOperations({ store: f.store, session: f.session }, client);
  const runtime = new PartnerRuntime(operations, () => state.time);
  t.after(() => runtime.dispose());
  return {
    ...f,
    runtime,
    state,
    operations,
    async open() {
      await runtime.setActive(true);
      await idle(runtime);
    },
  };
}
test("partner projection excludes self, clips partial coverage and exposes no personal fields", () => {
  const result = partnerAgenda(
    [
      snapshot({ actorId: account.actor }),
      snapshot({ title: "Private", calendarId: "Private source" }),
    ],
    account.actor,
    { start: now - 100, end: now + 150 },
    now,
  );
  assert.equal(result.complete, false);
  assert.deepEqual(result.intervals, [{ start: now + 100, end: now + 150 }]);
  assert.doesNotMatch(JSON.stringify(result), /Private|actorId|calendarId|title/);
  for (const values of [
    null,
    [],
    [snapshot({ actorId: account.actor })],
    [snapshot(), snapshot()],
    [snapshot(), snapshot({ actorId: id(3) })],
  ])
    assert.deepEqual(partnerAgenda(values, account.actor, { start: now, end: now + 1000 }, now), {
      status: "unknown",
    });
});
test("fresh evidence expires through its timer even without another read or date change", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const f = await setup(t);
  await f.open();
  assert.equal(f.runtime.getSnapshot().snapshots.length, 1);
  f.state.time += 899999;
  t.mock.timers.tick(899999);
  assert.equal(f.runtime.getSnapshot().snapshots.length, 1);
  f.state.time++;
  t.mock.timers.tick(1);
  assert.equal(f.runtime.getSnapshot().snapshots, null);
  assert.match(f.runtime.getSnapshot().notice, /no longer fresh/);
});
test("failed remote refresh clears prior evidence and explicit retry recovers", async (t) => {
  const f = await setup(t);
  await f.open();
  f.state.error = "unavailable";
  await f.runtime.refresh();
  assert.equal(f.runtime.getSnapshot().snapshots, null);
  assert.equal(f.runtime.getSnapshot().access, true);
  f.state.error = null;
  await f.runtime.refresh();
  assert.equal(f.runtime.getSnapshot().snapshots.length, 1);
  f.state.value = [];
  await f.runtime.refresh();
  assert.deepEqual(f.runtime.getSnapshot().snapshots, []);
});
test("background/disposal aborts a delayed result and foreground owns a fresh read", async (t) => {
  const f = await setup(t);
  await f.open();
  const pending = deferred();
  f.state.pending = pending;
  const loading = f.runtime.refresh();
  await f.runtime.setActive(false);
  assert.equal(f.runtime.getSnapshot().snapshots, null);
  f.state.pending = null;
  f.state.value = [];
  await f.runtime.setActive(true);
  await idle(f.runtime);
  pending.resolve();
  await loading;
  assert.deepEqual(f.runtime.getSnapshot().snapshots, []);
  f.runtime.dispose();
  await f.runtime.refresh();
  assert.equal(f.runtime.getSnapshot().snapshots, null);
});
test("server membership denial and changed local account leases clear shared data", async (t) => {
  const f = await setup(t);
  await f.open();
  f.state.error = "forbidden";
  await f.runtime.refresh();
  assert.equal(f.runtime.getSnapshot().access, false);
  assert.equal(f.runtime.getSnapshot().snapshots, null);
  const g = await setup(t);
  await g.open();
  await run(g.store.activate({ ...account, actor: id(99) }, id(98)));
  await g.runtime.refresh();
  assert.equal(g.runtime.getSnapshot().access, false);
  assert.equal(g.runtime.getSnapshot().snapshots, null);
});

test("local account change during an in-flight partner response is rechecked before display", async (t) => {
  const f = await fixture(t);
  const client = {
    snapshots: () =>
      Effect.promise(async () => {
        await run(f.store.activate({ ...account, household: id(20) }, id(21)));
        return [snapshot()];
      }),
  };
  const runtime = new PartnerRuntime(
    partnerOperations({ store: f.store, session: f.session }, client),
    () => now,
  );
  t.after(() => runtime.dispose());
  await runtime.setActive(true);
  await idle(runtime);
  assert.equal(runtime.getSnapshot().access, false);
  assert.equal(runtime.getSnapshot().snapshots, null);
});
test("declining device-calendar permission still permits partner blocks and date navigation without false personal success", async (t) => {
  const local = await personalAgenda(t);
  local.state.permission = false;
  await local.open();
  const shared = new PartnerRuntime(
    partnerOperations(
      { store: local.store, session: local.session },
      { snapshots: () => Effect.succeed([snapshot()]) },
    ),
    () => now,
  );
  t.after(() => shared.dispose());
  await shared.setActive(true);
  await idle(shared);
  assert.equal(
    partnerAgenda(
      shared.getSnapshot().snapshots,
      account.actor,
      { start: now, end: now + 1000 },
      now,
    ).status,
    "known",
  );
  await local.runtime.changeDate("2026-09-22");
  assert.equal(local.runtime.getSnapshot().date, "2026-09-22");
  assert.equal(local.runtime.getSnapshot().result, null);
  assert.equal(local.runtime.getSnapshot().permission, false);
  assert.equal(local.state.reads.length, 0);
});
