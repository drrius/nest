import * as Calendar from "expo-calendar";
import type { AgendaPort } from "./agenda-reader.ts";

// Deliberately separate from the sanitized availability port: no event data is uploaded.
export const expoAgendaPort: AgendaPort = {
  permission: async () => (await Calendar.getCalendarPermissions(false)).granted,
  calendars: async () =>
    (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).map((calendar) => ({
      id: calendar.id,
      title: calendar.title,
      color: calendar.color,
    })),
  events: async (ids, window) =>
    (await Calendar.listEvents([...ids], new Date(window.start), new Date(window.end))).map(
      (event) => ({
        id: event.id,
        calendarId: event.calendarId,
        title: event.title,
        location: event.location,
        notes: event.notes,
        startDate: event.startDate,
        endDate: event.endDate,
        allDay: event.allDay,
        status: event.status,
      }),
    ),
};
