import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { calendarClient } from "../src/calendar/client.ts";
import { CalendarChoreRuntime, visibleCalendarChores } from "../src/calendar/chore-runtime.ts";
import { calendarChoreOperations } from "../src/calendar/chore-operations.ts";
import { calendarChoreOwner } from "../src/calendar/chore-owner.ts";
import { agendaRows } from "../src/calendar/agenda-rows.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { fixture, run, account } from "./offline-fixture.mjs";
import { deferred } from "./calendar-agenda-runtime-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const date = "2026-09-21",
  next = "2026-09-22";
const row = (day = date) => ({
  occurrenceId: id(100),
  routineId: id(101),
  title: "Kitchen",
  dueDate: day,
  assigneeId: null,
  role: "preview",
});
async function setup(t) {
  const f = await fixture(t),
    state = { error: null, pending: null, calls: [] };
  const operations = calendarChoreOperations(
    { store: f.store, session: f.session },
    {
      chores: (day) =>
        Effect.gen(function* () {
          state.calls.push(day);
          const pending = state.pending;
          if (pending) yield* Effect.promise(() => pending.promise);
          if (state.error) return yield* new PreferenceFailure({ code: state.error });
          return [row(day)];
        }),
    },
  );
  const runtime = new CalendarChoreRuntime(operations, date);
  t.after(() => runtime.dispose());
  return { ...f, state, operations, runtime };
}
test("chore layer is opt-in, untimed, date-bound and fails visibly before retry", async (t) => {
  const f = await setup(t),
    r = f.runtime;
  await r.setActive(true);
  assert.deepEqual(f.state.calls, []);
  await r.setEnabled(true);
  assert.deepEqual(visibleCalendarChores(r.getSnapshot(), date), [row()]);
  assert.deepEqual(visibleCalendarChores(r.getSnapshot(), next), []);
  const mixed = agendaRows([], [{ start: 100, end: 200 }], [row()]);
  assert.equal(mixed[0].kind, "chore");
  assert.equal(mixed[0].start, undefined);
  f.state.error = "unavailable";
  await r.refresh();
  assert.equal(r.getSnapshot().rows, null);
  assert.match(r.getSnapshot().notice, /Could not load/);
  f.state.error = null;
  await r.refresh();
  assert.deepEqual(r.getSnapshot().rows, [row()]);
  await r.changeDate("bad-date");
  assert.equal(r.getSnapshot().date, date);
});
test("date change and disabling abort late reads without overwriting newer data", async (t) => {
  const f = await setup(t),
    r = f.runtime;
  await r.setActive(true);
  f.state.pending = deferred();
  const blocked = f.state.pending,
    first = r.setEnabled(true);
  while (!f.state.calls.length) await new Promise(setImmediate);
  f.state.pending = null;
  await r.changeDate(next);
  blocked.resolve();
  await first;
  assert.deepEqual(r.getSnapshot().rows, [row(next)]);
  f.state.pending = deferred();
  const delayed = r.refresh();
  await r.setEnabled(false);
  f.state.pending.resolve();
  await delayed;
  assert.equal(r.getSnapshot().rows, null);
  assert.equal(r.getSnapshot().busy, false);
});
test("background and account lease changes clear chore data and prevent old-session reads", async (t) => {
  const f = await setup(t),
    r = f.runtime;
  await r.setActive(true);
  await r.setEnabled(true);
  await r.setActive(false);
  assert.equal(r.getSnapshot().rows, null);
  await r.setActive(true);
  await run(f.store.activate(account, id(900)));
  await r.refresh();
  assert.equal(r.getSnapshot().access, false);
  assert.equal(r.getSnapshot().rows, null);
  const count = f.state.calls.length;
  await r.refresh();
  assert.equal(f.state.calls.length, count);
});
test("lease change during response and remote revocation reject access; owners dispose without retaining rows", async (t) => {
  const f = await setup(t),
    r = f.runtime;
  await r.setActive(true);
  f.state.pending = deferred();
  const read = r.setEnabled(true);
  while (!f.state.calls.length) await new Promise(setImmediate);
  await run(f.store.activate(account, id(901)));
  f.state.pending.resolve();
  await read;
  assert.equal(r.getSnapshot().access, false);
  const owner = calendarChoreOwner(
    { read: () => Effect.fail(new PreferenceFailure({ code: "forbidden" })) },
    date,
  );
  const off = owner.subscribe(() => {}),
    current = owner.getSnapshot();
  await current.setEnabled(true);
  await current.setActive(true);
  assert.equal(current.getSnapshot().access, false);
  off();
  assert.equal(owner.getSnapshot(), null);
  const again = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), current);
  again();
});
test("calendar client binds response date and household and refuses malformed or truncated content", async () => {
  const client = calendarClient(
    "http://localhost/",
    account,
    Effect.succeed({ user: { id: account.actor }, access_token: "fixture" }),
  );
  const envelope = { version: 1, householdId: account.household, date, chores: [row()] };
  for (const value of [
    { ...envelope, householdId: id(999) },
    { ...envelope, date: next, chores: [row(next)] },
    { ...envelope, chores: [row(), row()] },
  ])
    await assert.rejects(
      run(
        client
          .chores(date)
          .pipe(Effect.provideService(FetchHttpClient.Fetch, async () => Response.json(value))),
      ),
      { code: "unavailable" },
    );
  const result = await run(
    client.chores(date).pipe(
      Effect.provideService(FetchHttpClient.Fetch, async (url) => {
        assert.equal(new URL(url).searchParams.get("date"), date);
        return Response.json(envelope);
      }),
    ),
  );
  assert.deepEqual(result, [row()]);
});
