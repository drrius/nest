import * as Schema from "effect/Schema";
import { SaveMealReminder, canonicalMealReminder } from "@nest/contracts/meal-reminders";
import { renewalDeadline } from "@nest/domain/renewals";
import { reminderRecipientLabel } from "../renewal-reminders/recipient-label.ts";
import type { ReminderEditorContext } from "./editor-context.ts";
export function reminderConfirmation(
  input: typeof SaveMealReminder.Type,
  context: ReminderEditorContext,
  current: () => boolean,
  save: (command: typeof SaveMealReminder.Type) => Promise<void>,
) {
  const command = canonicalMealReminder(
    Schema.decodeUnknownSync(SaveMealReminder)(input, { onExcessProperty: "error" }),
  );
  if (
    context.meal.entryId !== command.entryId ||
    context.itemRevision !== command.expectedItemRevision ||
    (context.reminder?.revision ?? null) !== command.expectedRevision
  )
    return null;
  const settings = command.settings;
  const recipients = settings.recipientIds.map((id) =>
    context.members.find((member) => member.actorId === id),
  );
  if (recipients.some((member) => !member)) return null;
  const date = renewalDeadline(context.meal.date, settings.daysBefore);
  if (!date) return null;
  let used = false;
  return {
    message: `${context.meal.title}\nReminder: ${settings.enabled ? "On" : "Off"}\nRecipients: ${recipients.map((member) => reminderRecipientLabel(member!, context.actorId)).join(", ") || "None"}\nWhen: ${date} at ${settings.localTime} (Europe/Zurich)\n\nRecipient mute settings apply. This reminder is for this meal only. Changing or removing the meal invalidates it.`,
    confirm: async () => {
      if (used || !current()) return false;
      used = true;
      await save(command);
      return true;
    },
  };
}
