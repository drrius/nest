import * as Calendar from "expo-calendar";
import type { CalendarPort } from "./service.ts";

// Full read permission is required by iOS. This adapter exposes no EventKit writes.
export const expoCalendarPort: CalendarPort = {
  permission: async () => (await Calendar.getCalendarPermissions(false)).granted,
  requestPermission: async () => (await Calendar.requestCalendarPermissions(false)).granted,
  calendars: async () =>
    (await Calendar.getCalendars(Calendar.EntityTypes.EVENT)).map((calendar) => ({
      id: calendar.id,
      title: calendar.title,
      color: calendar.color,
    })),
  events: async (ids, window) =>
    (await Calendar.listEvents([...ids], new Date(window.start), new Date(window.end))).map(
      (event) => ({
        calendarId: event.calendarId,
        startDate: event.startDate,
        endDate: event.endDate,
        availability: event.availability,
        status: event.status,
      }),
    ),
};
