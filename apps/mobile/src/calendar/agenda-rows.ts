import type { AgendaRow } from "./agenda.ts";
import type { Window } from "./availability.ts";
export type CalendarRow =
  | { kind: "personal"; key: string; start: number; value: AgendaRow }
  | { kind: "partner"; key: string; start: number; value: Window };
export function agendaRows(
  personal: readonly AgendaRow[],
  partner: readonly Window[],
): CalendarRow[] {
  const rows: CalendarRow[] = personal.map((value) => ({
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
  return rows.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
}
