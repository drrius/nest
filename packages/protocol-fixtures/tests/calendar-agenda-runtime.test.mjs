import assert from "node:assert/strict";
import test from "node:test";
import { AgendaRuntime } from "../src/calendar/agenda-runtime.ts";
import { agendaOperations } from "../src/calendar/agenda-operations.ts";
import { agendaOwner } from "../src/calendar/agenda-owner.ts";
import { account, run } from "./offline-fixture.mjs";
import { setup, idle, deferred } from "./calendar-agenda-runtime-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("first-use choices save before EventKit access, survive SQLite restart and never enable sharing", async (t) => {
  const f = await setup(t, null);
  await f.open();
  assert.equal(f.state.prompts, 0);
  assert.equal(f.state.reads.length, 0);
  assert.equal(f.runtime.getSnapshot().selection, null);
  await f.runtime.changeSelection(["shared"]);
  assert.equal(f.runtime.getSnapshot().result.rows[0].title, "Private appointment");
  assert.deepEqual(f.state.reads[0].ids, ["shared"]);
  assert.equal(await run(f.store.readCalendarSelection(f.session)), null);
  f.runtime.dispose();
  const reopened = f.reopen(),
    session = await run(reopened.store.activate(account, id(1)));
  const runtime = new AgendaRuntime(
    agendaOperations({ store: reopened.store, session }, f.port),
    "2026-09-22",
  );
  t.after(() => runtime.dispose());
  runtime.setActive(true);
  await idle(runtime);
  assert.deepEqual(runtime.getSnapshot().selection.calendarIds, ["shared"]);
  assert.equal(runtime.getSnapshot().result.rows.length, 1);
});

test("permission is explicit; refusal and missing calendars never look like an empty successful agenda", async (t) => {
  const f = await setup(t);
  f.state.permission = false;
  await f.open();
  assert.equal(f.state.prompts, 0);
  assert.equal(f.runtime.getSnapshot().permission, false);
  assert.equal(f.runtime.getSnapshot().result, null);
  await f.runtime.requestPermission();
  assert.equal(f.state.prompts, 1);
  assert.equal(f.runtime.getSnapshot().result.rows.length, 1);
  f.state.catalogs = [];
  await f.runtime.refresh();
  assert.equal(f.runtime.getSnapshot().result.reason, "missing_calendar");
  await f.runtime.changeSelection([]);
  assert.deepEqual(f.runtime.getSnapshot().result, { status: "ready", rows: [] });
});

test("failed display selection save keeps old IDs and retry succeeds without altering sharing", async (t) => {
  const f = await setup(t);
  await f.open();
  f.connection.exec(
    "create trigger failed_agenda before update on agenda_selection begin select raise(abort,'fixture'); end;",
  );
  await f.runtime.changeSelection(["shared"]);
  assert.deepEqual(f.runtime.getSnapshot().selection.calendarIds, ["personal"]);
  assert.match(f.runtime.getSnapshot().notice, /last saved selection/);
  assert.equal(f.state.reads.length, 1);
  f.connection.exec("drop trigger failed_agenda");
  await f.runtime.changeSelection(["shared"]);
  assert.deepEqual(f.runtime.getSnapshot().selection.calendarIds, ["shared"]);
  assert.deepEqual(await run(f.store.readAgendaSelection(f.session)), { calendarIds: ["shared"] });
});

test("background/blur clears private rows and calendar titles; a late read cannot restore them", async (t) => {
  const f = await setup(t);
  await f.open();
  const pending = deferred();
  f.state.events = async () => {
    await pending.promise;
    return [
      {
        id: "late",
        calendarId: "personal",
        title: "Late private",
        notes: "",
        location: null,
        allDay: false,
        status: "confirmed",
        startDate: "2026-09-21T12:00:00Z",
        endDate: "2026-09-21T13:00:00Z",
      },
    ];
  };
  const refresh = f.runtime.refresh();
  await new Promise((resolve) => setImmediate(resolve));
  f.runtime.setActive(false);
  assert.equal(f.runtime.getSnapshot().result, null);
  assert.deepEqual(f.runtime.getSnapshot().calendars, []);
  pending.resolve();
  await refresh;
  assert.doesNotMatch(JSON.stringify(f.runtime.getSnapshot()), /Private|private|personal/);
  f.state.events = null;
  f.runtime.setActive(true);
  await idle(f.runtime);
  assert.equal(f.runtime.getSnapshot().result.rows[0].title, "Private appointment");
});

test("a changed SQLite account lease during a native read hides all personal state", async (t) => {
  const f = await setup(t);
  f.state.events = async () => {
    await run(f.store.activate({ ...account, actor: id(4) }, id(5)));
    return [];
  };
  await f.open();
  const view = f.runtime.getSnapshot();
  assert.equal(view.access, false);
  assert.equal(view.result, null);
  assert.equal(view.selection, null);
  assert.deepEqual(view.calendars, []);
});

test("date changes read the requested local day and permission loss discards previous content", async (t) => {
  const f = await setup(t);
  await f.open();
  await f.runtime.changeDate("2026-09-22");
  assert.equal(f.runtime.getSnapshot().date, "2026-09-22");
  assert.equal(new Date(f.state.reads.at(-1).window.start).getDate(), 22);
  await f.runtime.changeDate("invalid");
  assert.equal(f.runtime.getSnapshot().date, "2026-09-22");
  f.state.permission = false;
  await f.runtime.refresh();
  assert.equal(f.runtime.getSnapshot().result, null);
  assert.deepEqual(f.runtime.getSnapshot().calendars, []);
  f.runtime.dispose();
  await f.runtime.changeSelection(["shared"]);
  await f.runtime.requestPermission();
  assert.equal(f.state.prompts, 0);
});

test("subscription-owned runtime restarts cleanly after final unsubscribe", async (t) => {
  const f = await setup(t);
  const owner = agendaOwner(f.operations, "2026-09-21");
  const stop = owner.subscribe(() => {}),
    first = owner.getSnapshot();
  first.setActive(true);
  await idle(first);
  stop();
  assert.equal(owner.getSnapshot(), null);
  assert.equal(first.getSnapshot().result, null);
  const stopAgain = owner.subscribe(() => {}),
    second = owner.getSnapshot();
  assert.notEqual(second, first);
  assert.equal(second.getSnapshot().active, false);
  second.setActive(true);
  await idle(second);
  assert.equal(second.getSnapshot().result.rows.length, 1);
  stopAgain();
});

test("foreground refresh wins over an older canceled read and its completion cannot clear new state", async (t) => {
  const f = await setup(t);
  await f.open();
  const old = deferred(),
    started = deferred();
  f.state.events = async () => {
    started.resolve();
    await old.promise;
    return [];
  };
  const previous = f.runtime.refresh();
  await started.promise;
  f.runtime.setActive(false);
  f.state.events = null;
  f.runtime.setActive(true);
  await idle(f.runtime);
  assert.equal(f.runtime.getSnapshot().result.rows.length, 1);
  old.resolve();
  await previous;
  assert.equal(f.runtime.getSnapshot().result.rows[0].title, "Private appointment");
  assert.equal(f.runtime.getSnapshot().busy, false);
});

test("date navigation cannot turn a failed initial calendar load or denied permission into empty success", async (t) => {
  const f = await setup(t);
  const original = f.port.calendars;
  f.port.calendars = async () => {
    throw Error("Private calendar failure");
  };
  await f.open();
  const notice = f.runtime.getSnapshot().notice;
  assert.equal(f.runtime.getSnapshot().loaded, false);
  await f.runtime.changeDate("2026-09-22");
  assert.equal(f.runtime.getSnapshot().result, null);
  assert.equal(f.runtime.getSnapshot().notice, notice);
  assert.equal(f.runtime.getSnapshot().date, "2026-09-22");
  f.port.calendars = original;
  f.state.permission = false;
  await f.runtime.refresh();
  await f.runtime.changeDate("2026-09-22");
  assert.equal(f.runtime.getSnapshot().result, null);
  assert.equal(f.runtime.getSnapshot().date, "2026-09-22");
  f.state.permission = true;
  await f.runtime.refresh();
  await f.runtime.changeDate("2026-09-22");
  assert.equal(f.runtime.getSnapshot().result.rows.length, 1);
  assert.equal(f.runtime.getSnapshot().date, "2026-09-22");
});
