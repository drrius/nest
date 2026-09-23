import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
import { ReminderTime } from "./reminders.ts";
/** Explicit reminder timing for items without an intrinsic due date. */
export const DatedReminderSettings = Schema.Struct({
  enabled: Schema.Boolean,
  recipientIds: Schema.Array(Schema.String.check(Schema.isUUID())).check(Schema.isMaxLength(2)),
  localDate: CalendarDate,
  localTime: ReminderTime,
}).check(
  Schema.makeFilter((value) => {
    const recipients = value.recipientIds.map((id) => id.toLowerCase());
    return (
      new Set(recipients).size === recipients.length && (!value.enabled || recipients.length > 0)
    );
  }),
);
export type DatedReminderSettings = typeof DatedReminderSettings.Type;
export function canonicalDatedReminderSettings(
  settings: DatedReminderSettings,
): DatedReminderSettings {
  return { ...settings, recipientIds: settings.recipientIds.map((id) => id.toLowerCase()).sort() };
}
