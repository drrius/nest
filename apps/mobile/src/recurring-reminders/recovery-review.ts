import type { SaveRecurringReminder } from "@nest/contracts/recurring-reminders";
import type { ReminderEditorContext } from "./editor-context.ts";
import { reminderRecipientLabel } from "../renewal-reminders/recipient-label.ts";
export function reminderRecoveryReview(
  command: typeof SaveRecurringReminder.Type,
  ruleId: string,
  context: ReminderEditorContext | null,
) {
  if (command.ruleId !== ruleId) return { target: command.ruleId, summary: null };
  const matching = context?.rule.ruleId === command.ruleId ? context : null;
  const title = matching?.rule.configuration.description ?? `Recurring ${command.ruleId}`;
  const settings = command.settings;
  const names = settings.recipientIds.map((id) => {
    const member = matching?.members.find((value) => value.actorId === id);
    return member && matching ? reminderRecipientLabel(member, matching.actorId) : `Member ${id}`;
  });
  return {
    target: null,
    summary: `${title}\nRule reference: ${command.ruleId}\nPending reminder: ${settings.enabled ? "On" : "Off"}\nRecipients: ${names.join(", ") || "None"}\n${settings.daysBefore} days before the reviewed due date, at ${settings.localTime} (Europe/Zurich).\nThese are the original pending settings. Recipient mute settings apply.`,
  };
}
