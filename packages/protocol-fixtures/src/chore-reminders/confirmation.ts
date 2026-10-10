import * as Schema from "effect/Schema";
import { SaveChoreReminder, canonicalChoreReminder } from "@nest/contracts/chore-reminders";
import { renewalDeadline } from "@nest/domain/renewals";
import { reminderRecipientLabel } from "../renewal-reminders/recipient-label.ts";
import type { ReminderEditorContext } from "./editor-context.ts";
export function reminderConfirmation(
  input: typeof SaveChoreReminder.Type,
  context: ReminderEditorContext,
  current: () => boolean,
  save: (command: typeof SaveChoreReminder.Type) => Promise<void>,
) {
  const command = canonicalChoreReminder(
    Schema.decodeUnknownSync(SaveChoreReminder)(input, { onExcessProperty: "error" }),
  );
  if (
    context.chore.occurrenceId !== command.occurrenceId ||
    context.itemRevision !== command.expectedItemRevision ||
    (context.reminder?.revision ?? null) !== command.expectedRevision
  )
    return null;
  const settings = command.settings;
  const recipients = settings.recipientIds.map((id) =>
    context.members.find((member) => member.actorId === id),
  );
  if (recipients.some((member) => !member)) return null;
  const date = renewalDeadline(context.chore.dueDate, settings.daysBefore);
  if (!date) return null;
  let used = false;
  return {
    message: `${context.chore.title}\nReminder: ${settings.enabled ? "On" : "Off"}\nRecipients: ${recipients.map((member) => reminderRecipientLabel(member!, context.actorId)).join(", ") || "None"}\nWhen: ${date} at ${settings.localTime} (Europe/Zurich)\n\nRecipient mute settings apply. This reminder is for this occurrence only. Changing or completing the chore invalidates it.`,
    confirm: async () => {
      if (used || !current()) return false;
      used = true;
      await save(command);
      return true;
    },
  };
}
