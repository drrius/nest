import type { SaveMealReminder } from "@nest/contracts/meal-reminders";
import type { ReminderEditorContext } from "./editor-context.ts";
import { reminderRecipientLabel } from "../renewal-reminders/recipient-label.ts";
export function reminderRecoveryReview(
  command: typeof SaveMealReminder.Type,
  entryId: string,
  context: ReminderEditorContext | null,
) {
  if (command.entryId !== entryId) return { target: command.entryId, summary: null };
  const matching = context?.meal.entryId === command.entryId ? context : null;
  const title = matching?.meal.title ?? `Meal ${command.entryId}`;
  const settings = command.settings;
  const names = settings.recipientIds.map((id) => {
    const member = matching?.members.find((value) => value.actorId === id);
    return member && matching ? reminderRecipientLabel(member, matching.actorId) : `Member ${id}`;
  });
  return {
    target: null,
    summary: `${title}\nPending reminder: ${settings.enabled ? "On" : "Off"}\nRecipients: ${names.join(", ") || "None"}\n${settings.daysBefore} days before the reviewed meal date, at ${settings.localTime} (Europe/Zurich).\nThese are the original pending settings. Recipient mute settings apply.`,
  };
}
