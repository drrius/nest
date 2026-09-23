import * as Schema from "effect/Schema";
import { SaveGroceryReminder, canonicalGroceryReminder } from "@nest/contracts/grocery-reminders";
import { reminderRecipientLabel } from "../renewal-reminders/recipient-label.ts";
import type { ReminderEditorContext } from "./editor-context.ts";
export function reminderConfirmation(
  input: typeof SaveGroceryReminder.Type,
  context: ReminderEditorContext,
  current: () => boolean,
  save: (command: typeof SaveGroceryReminder.Type) => Promise<void>,
) {
  const command = canonicalGroceryReminder(
    Schema.decodeUnknownSync(SaveGroceryReminder)(input, { onExcessProperty: "error" }),
  );
  if (
    context.grocery.itemId !== command.itemId ||
    context.itemVersion !== command.expectedItemVersion ||
    (context.reminder?.revision ?? null) !== command.expectedRevision
  )
    return null;
  const settings = command.settings;
  const recipients = settings.recipientIds.map((id) =>
    context.members.find((member) => member.actorId === id),
  );
  if (recipients.some((member) => !member)) return null;
  const date = settings.localDate;
  if (!date) return null;
  let used = false;
  return {
    message: `${context.grocery.name}\nReminder: ${settings.enabled ? "On" : "Off"}\nRecipients: ${recipients.map((member) => reminderRecipientLabel(member!, context.actorId)).join(", ") || "None"}\nWhen: ${date} at ${settings.localTime} (Europe/Zurich)\n\nRecipient mute settings apply. This reminder is for this grocery item only. Checking, changing or removing the item invalidates it.`,
    confirm: async () => {
      if (used || !current()) return false;
      used = true;
      await save(command);
      return true;
    },
  };
}
