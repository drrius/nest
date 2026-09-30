import * as Schema from "effect/Schema";
import {
  DatedReminderSettings,
  canonicalDatedReminderSettings,
} from "@nest/contracts/dated-reminders";
import type { GroceryReminder } from "@nest/contracts/grocery-reminders";
export interface ReminderDraft {
  enabled: boolean;
  recipientIds: readonly string[];
  localTime: string;
  localDate: string;
}
export function reminderDraft(reminder: typeof GroceryReminder.Type | null): ReminderDraft {
  if (!reminder) return { enabled: false, recipientIds: [], localTime: "09:00", localDate: "" };
  return { ...reminder.settings, recipientIds: [...reminder.settings.recipientIds] };
}
export function parseReminderDraft(draft: ReminderDraft): typeof DatedReminderSettings.Type | null {
  return Schema.is(DatedReminderSettings)(draft) ? canonicalDatedReminderSettings(draft) : null;
}
