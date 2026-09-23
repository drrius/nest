import { agendaDay } from "./agenda-day.ts";
import type { AgendaRuntime } from "./agenda-runtime.ts";
export function requestedAgendaDate(input: unknown, fallback: string) {
  return typeof input === "string" && agendaDay(input) ? input : fallback;
}
/** Keep a route request pending during reads and while the tab is inactive. */
export function followAgendaRouteDate(runtime: AgendaRuntime, date: string) {
  if (!agendaDay(date)) return () => {};
  const apply = () => {
    const view = runtime.getSnapshot();
    if (view.active && view.access && !view.busy && view.date !== date)
      void runtime.changeDate(date);
  };
  const unsubscribe = runtime.subscribe(apply);
  apply();
  return unsubscribe;
}
