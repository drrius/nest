import type { SaveChoreReminder } from "@nest/contracts/chore-reminders";
import type { ReminderEditorContext } from "./editor-context.ts";
import { reminderRecipientLabel } from "../renewal-reminders/recipient-label.ts";
export function reminderRecoveryReview(
  command: typeof SaveChoreReminder.Type,
  occurrenceId: string,
  context: ReminderEditorContext | null,
) {
  if (command.occurrenceId !== occurrenceId) return { target: command.occurrenceId, summary: null };
  const matching = context?.chore.occurrenceId === command.occurrenceId ? context : null;
  const title = matching?.chore.title ?? `Chore ${command.occurrenceId}`;
  const settings = command.settings;
  const names = settings.recipientIds.map((id) => {
    const member = matching?.members.find((value) => value.actorId === id);
    return member && matching ? reminderRecipientLabel(member, matching.actorId) : `Member ${id}`;
  });
  return {
    target: null,
    summary: `${title}\nPending reminder: ${settings.enabled ? "On" : "Off"}\nRecipients: ${names.join(", ") || "None"}\n${settings.daysBefore} days before the reviewed due date, at ${settings.localTime} (Europe/Zurich).\nThese are the original pending settings. Recipient mute settings apply.`,
  };
}
