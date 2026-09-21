import * as Schema from "effect/Schema";
import { CalendarDate } from "@nest/contracts/chores";
export function localDate(value: Date) {
  return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function agendaDay(date: string) {
  if (!Schema.is(CalendarDate)(date)) return null;
  const start = new Date(`${date}T00:00:00`);
  if (localDate(start) !== date) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
}
export function adjacentDay(date: string, offset: -1 | 1) {
  const window = agendaDay(date);
  if (!window) return null;
  const next = new Date(window.start);
  next.setDate(next.getDate() + offset);
  const result = localDate(next);
  return Schema.is(CalendarDate)(result) ? result : null;
}
