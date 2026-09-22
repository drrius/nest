import * as Schema from "effect/Schema";
import {
  RenewalReminderSettings,
  type RenewalReminder,
  canonicalReminderSettings,
} from "@nest/contracts/reminders";
export interface ReminderDraft {
  enabled: boolean;
  recipientIds: readonly string[];
  localTime: string;
  daysBefore: string;
  anchor: "renewal" | "cancellation";
}
export function reminderDraft(reminder: typeof RenewalReminder.Type | null): ReminderDraft {
  if (!reminder)
    return {
      enabled: false,
      recipientIds: [],
      localTime: "09:00",
      daysBefore: "0",
      anchor: "renewal",
    };
  const { anchor, delivery } = reminder.settings;
  return {
    ...delivery,
    recipientIds: [...delivery.recipientIds],
    daysBefore: String(delivery.daysBefore),
    anchor,
  };
}
export function parseReminderDraft(
  draft: ReminderDraft,
): typeof RenewalReminderSettings.Type | null {
  if (!/^(0|[1-9]\d{0,2})$(?![\s\S])/.test(draft.daysBefore)) return null;
  const value = {
    anchor: draft.anchor,
    delivery: {
      enabled: draft.enabled,
      recipientIds: draft.recipientIds,
      localTime: draft.localTime,
      daysBefore: Number(draft.daysBefore),
    },
  };
  return Schema.is(RenewalReminderSettings)(value)
    ? { ...value, delivery: canonicalReminderSettings(value.delivery) }
    : null;
}
