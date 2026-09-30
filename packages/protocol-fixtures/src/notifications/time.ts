import * as Schema from "effect/Schema";
import { NotificationPreferences } from "@nest/contracts/notifications";
const validTime = Schema.is(NotificationPreferences.fields.dailySummaryTime);
// A UTC anchor carries only a wall-clock choice; it is not a delivery timestamp.
// The picker uses UTC so travel and daylight-saving gaps cannot alter HH:mm.
export function pickerTime(time: string): Date {
  if (!validTime(time)) throw new RangeError("Invalid summary time");
  return new Date(`2000-01-01T${time}:00.000Z`);
}
export function summaryTime(value: Date): string | null {
  if (!Number.isFinite(value.getTime())) return null;
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}
