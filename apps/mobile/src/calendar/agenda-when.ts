import type { AgendaRow } from "./agenda";

export function formatAgendaWhen(
  row: Pick<AgendaRow, "allDay" | "start" | "end">,
  locale?: string,
  timeZone?: string,
): string {
  const zone = timeZone ? { timeZone } : {};
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium", ...zone });
  const startDay = day.format(row.start);
  if (!row.allDay) {
    const endDay = day.format(row.end);
    if (startDay === endDay) {
      const time = new Intl.DateTimeFormat(locale, { timeStyle: "short", ...zone });
      return `${startDay} · ${time.format(row.start)} – ${time.format(row.end)}`;
    }
    const moment = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      ...zone,
    });
    return `${moment.format(row.start)} — ${moment.format(row.end)}`;
  }
  const endDay = day.format(Math.max(row.start, row.end - 1));
  return startDay === endDay ? `All day · ${startDay}` : `All day · ${startDay} — ${endDay}`;
}
