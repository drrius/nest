import * as Schema from "effect/Schema";
import { validWindow, type Window } from "./availability.ts";

// Personal event details are local-only. This type must not enter shared API contracts.
export interface AgendaEvent {
  readonly id: string;
  readonly calendarId: string;
  readonly title: string | null;
  readonly location: string | null;
  readonly notes: string | null;
  readonly startDate: Date | string;
  readonly endDate: Date | string;
  readonly allDay: boolean;
  readonly status: string;
}
export interface AgendaRow {
  readonly key: string;
  readonly calendarId: string;
  readonly title: string;
  readonly location: string | null;
  readonly notes: string;
  readonly start: number;
  readonly end: number;
  readonly allDay: boolean;
}
export type AgendaResult =
  | { readonly status: "ready"; readonly rows: readonly AgendaRow[] }
  | {
      readonly status: "unavailable";
      readonly reason: "permission" | "missing_calendar" | "invalid_events" | "unavailable";
    };
const DisplayFields = Schema.Struct({
  id: Schema.NonEmptyString,
  calendarId: Schema.NonEmptyString,
  title: Schema.NullOr(Schema.String),
  location: Schema.NullOr(Schema.String),
  notes: Schema.NullOr(Schema.String),
  allDay: Schema.Boolean,
  status: Schema.String,
});
const invalid = { status: "unavailable", reason: "invalid_events" } as const;
function instant(value: Date | string) {
  if (typeof value === "string" && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  if (!(value instanceof Date) && typeof value !== "string") return NaN;
  return new Date(value).getTime();
}
function row(event: AgendaEvent): AgendaRow | null {
  const start = instant(event.startDate),
    end = instant(event.endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) return null;
  if (!Schema.is(DisplayFields)(event)) return null;
  return {
    key: JSON.stringify([event.calendarId, event.id, start]),
    calendarId: event.calendarId,
    title: event.title ?? "",
    location: event.location,
    notes: event.notes ?? "",
    start,
    end,
    allDay: event.allDay,
  };
}
export function projectAgenda(
  events: readonly AgendaEvent[],
  selected: readonly string[],
  window: Window,
): AgendaResult {
  if (!validWindow(window)) return invalid;
  const rows = new Map<string, AgendaRow>();
  for (const event of events) {
    if (!selected.includes(event.calendarId) || event.status === "canceled") continue;
    const item = row(event);
    if (!item) return invalid;
    if (!overlaps(item, window)) continue;
    const previous = rows.get(item.key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(item)) return invalid;
    rows.set(item.key, item);
  }
  return {
    status: "ready",
    rows: [...rows.values()].sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        a.start - b.start ||
        a.end - b.end ||
        a.key.localeCompare(b.key),
    ),
  };
}

function overlaps(item: AgendaRow, window: Window) {
  return item.start === item.end
    ? item.start >= window.start && item.start < window.end
    : item.start < window.end && item.end > window.start;
}
