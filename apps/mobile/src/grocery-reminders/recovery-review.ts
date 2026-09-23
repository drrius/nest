import type { SaveGroceryReminder } from "@nest/contracts/grocery-reminders";
import type { ReminderEditorContext } from "./editor-context.ts";
import { reminderRecipientLabel } from "../renewal-reminders/recipient-label.ts";
export function reminderRecoveryReview(
  command: typeof SaveGroceryReminder.Type,
  itemId: string,
  context: ReminderEditorContext | null,
) {
  if (command.itemId !== itemId) return { target: command.itemId, summary: null };
  const matching = context?.grocery.itemId === command.itemId ? context : null;
  const title = matching?.grocery.name ?? `Grocery ${command.itemId}`;
  const settings = command.settings;
  const names = settings.recipientIds.map((id) => {
    const member = matching?.members.find((value) => value.actorId === id);
    return member && matching ? reminderRecipientLabel(member, matching.actorId) : `Member ${id}`;
  });
  return {
    target: null,
    summary: `${title}\nPending reminder: ${settings.enabled ? "On" : "Off"}\nRecipients: ${names.join(", ") || "None"}\n${settings.localDate} at ${settings.localTime} (Europe/Zurich).\nThese are the original pending settings. Recipient mute settings apply.`,
  };
}
