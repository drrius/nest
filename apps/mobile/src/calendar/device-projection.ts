import type { DeviceEvent } from "./availability.ts";
interface ReadableEvent extends DeviceEvent {
  getAttendees(): Promise<readonly { isCurrentUser?: boolean; status: string }[]>;
}
// Participant details never leave this local adapter. Unknown participation stays busy.
export async function projectDeviceEvents(
  events: readonly ReadableEvent[],
): Promise<DeviceEvent[]> {
  const result: DeviceEvent[] = [];
  for (const event of events) {
    const attendees =
      event.status === "canceled" || event.availability === "free"
        ? []
        : await event.getAttendees();
    const declined = attendees.some(
      (person) => person.isCurrentUser === true && person.status === "declined",
    );
    result.push({
      calendarId: event.calendarId,
      startDate: event.startDate,
      endDate: event.endDate,
      availability: declined ? "free" : event.availability,
      status: event.status,
    });
  }
  return result;
}
