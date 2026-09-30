import { setImmediate } from "node:timers/promises";
import { fixture, run } from "./offline-fixture.mjs";
import { AgendaRuntime } from "../src/calendar/agenda-runtime.ts";
import { agendaOperations } from "../src/calendar/agenda-operations.ts";
export function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export async function idle(runtime) {
  for (let i = 0; i < 200; i++) {
    if (!runtime.getSnapshot().busy) return;
    await setImmediate();
  }
  throw Error("Fixture runtime failed to settle");
}
export async function setup(t, selected = ["personal"]) {
  const f = await fixture(t);
  if (selected) await run(f.store.saveAgendaSelection(f.session, { calendarIds: selected }));
  const state = {
    permission: true,
    catalogs: [
      { id: "personal", title: "Private calendar" },
      { id: "shared", title: "Shared iCloud" },
    ],
    reads: [],
    prompts: 0,
    events: null,
  };
  const port = {
    permission: async () => state.permission,
    requestPermission: async () => {
      state.prompts++;
      state.permission = true;
      return true;
    },
    calendars: async () => state.catalogs,
    events: async (ids, window) => {
      state.reads.push({ ids, window });
      if (state.events) return state.events(ids, window);
      return [
        {
          id: "event",
          calendarId: ids[0],
          title: "Private appointment",
          location: "Private clinic",
          notes: "Private note",
          allDay: false,
          status: "confirmed",
          startDate: new Date(window.start + 3600000),
          endDate: new Date(window.start + 7200000),
        },
      ];
    },
  };
  const operations = agendaOperations({ store: f.store, session: f.session }, port);
  const runtime = new AgendaRuntime(operations, "2026-09-21");
  t.after(() => runtime.dispose());
  return {
    ...f,
    state,
    port,
    operations,
    runtime,
    async open() {
      runtime.setActive(true);
      await idle(runtime);
    },
  };
}
