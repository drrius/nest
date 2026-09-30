import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { followAgendaRouteDate, requestedAgendaDate } from "../src/calendar/route-date.ts";
import { agendaDay } from "../src/calendar/agenda-day.ts";
import { setup, idle, deferred } from "./calendar-agenda-runtime-fixture.mjs";
test("requested calendar dates reject malformed arrays and impossible days", () => {
  for (const value of [undefined, ["2026-09-22"], "2026-02-30", "not-a-date"])
    assert.equal(requestedAgendaDate(value, "2026-09-21"), "2026-09-21");
  assert.equal(requestedAgendaDate("2026-09-22", "2026-09-21"), "2026-09-22");
});
test("a calendar route request arriving during a read settles on the requested day", async (t) => {
  const f = await setup(t);
  await f.open();
  const wait = deferred();
  f.state.events = async () => {
    await wait.promise;
    return [];
  };
  const reading = f.runtime.refresh();
  const stop = followAgendaRouteDate(f.runtime, "2026-09-23");
  t.after(stop);
  assert.equal(f.runtime.getSnapshot().date, "2026-09-21");
  wait.resolve();
  await reading;
  await idle(f.runtime);
  assert.equal(f.runtime.getSnapshot().date, "2026-09-23");
  assert.deepEqual(f.state.reads.at(-1).window, agendaDay("2026-09-23"));
  assert.equal(f.state.prompts, 0);
});
test("inactive route requests wait for focus and replaced requests cannot pull the day back", async (t) => {
  const f = await setup(t);
  const old = followAgendaRouteDate(f.runtime, "2026-09-22");
  assert.equal(f.state.reads.length, 0);
  old();
  const current = followAgendaRouteDate(f.runtime, "2026-09-24");
  t.after(current);
  await f.open();
  await idle(f.runtime);
  assert.equal(f.runtime.getSnapshot().date, "2026-09-24");
  const count = f.state.reads.length;
  await setImmediate();
  assert.equal(f.state.reads.length, count);
  current();
  await f.runtime.changeDate("2026-09-25");
  assert.equal(f.runtime.getSnapshot().date, "2026-09-25");
});
