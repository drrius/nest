import type { CalendarChore } from "@nest/contracts/calendar-chores";
import type { AgendaRow } from "./agenda.ts";
import type { Window } from "./availability.ts";
type TimedRow =
  | { kind: "personal"; key: string; start: number; value: AgendaRow }
  | { kind: "partner"; key: string; start: number; value: Window };
export type CalendarRow =
  | TimedRow
  | { kind: "chore"; key: string; value: typeof CalendarChore.Type };
export function agendaRows(
  personal: readonly AgendaRow[],
  partner: readonly Window[],
  chores: readonly (typeof CalendarChore.Type)[] = [],
): CalendarRow[] {
  const rows: TimedRow[] = personal.map((value) => ({
    kind: "personal",
    key: `personal:${value.key}`,
    start: value.start,
    value,
  }));
  for (const value of partner)
    rows.push({
      kind: "partner",
      key: `partner:${value.start}:${value.end}`,
      start: value.start,
      value,
    });
  return [
    ...chores.map((value) => ({
      kind: "chore" as const,
      key: `chore:${value.occurrenceId}`,
      value,
    })),
    ...rows.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key)),
  ];
}
