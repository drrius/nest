import * as Schema from "effect/Schema";
import { ReminderSettings, canonicalReminderSettings } from "@nest/contracts/reminders";
import type { ChoreReminder } from "@nest/contracts/chore-reminders";
export interface ReminderDraft {
  enabled: boolean;
  recipientIds: readonly string[];
  localTime: string;
  daysBefore: string;
}
export function reminderDraft(reminder: typeof ChoreReminder.Type | null): ReminderDraft {
  if (!reminder) return { enabled: false, recipientIds: [], localTime: "09:00", daysBefore: "0" };
  return {
    ...reminder.settings,
    recipientIds: [...reminder.settings.recipientIds],
    daysBefore: String(reminder.settings.daysBefore),
  };
}
export function parseReminderDraft(draft: ReminderDraft): ReminderSettings | null {
  if (!/^(0|[1-9]\d{0,2})$(?![\s\S])/.test(draft.daysBefore)) return null;
  const value = { ...draft, daysBefore: Number(draft.daysBefore) };
  return Schema.is(ReminderSettings)(value) ? canonicalReminderSettings(value) : null;
}
