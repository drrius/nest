import { reminderRecipientLabel } from "./recipient-label.ts";
import * as Schema from "effect/Schema";
import { SaveRenewalReminder, canonicalRenewalReminder } from "@nest/contracts/reminders";
import { renewalDeadline } from "@nest/domain/renewals";
import type { ReminderEditorContext } from "./editor-context.ts";
export function reminderConfirmation(
  input: typeof SaveRenewalReminder.Type,
  context: ReminderEditorContext,
  current: () => boolean,
  save: (command: typeof SaveRenewalReminder.Type) => Promise<void>,
) {
  const command = canonicalRenewalReminder(
    Schema.decodeUnknownSync(SaveRenewalReminder)(input, { onExcessProperty: "error" }),
  );
  if (!matchesContext(command, context)) return null;
  const { delivery, anchor } = command.settings;
  const recipients = delivery.recipientIds.map((id) =>
    context.members.find((member) => member.actorId === id),
  );
  if (recipients.some((member) => !member)) return null;
  const base =
    anchor === "renewal" ? context.renewal.fields.renewalOn : context.renewal.cancellationOn;
  const date = renewalDeadline(base, delivery.daysBefore);
  if (!date) return null;
  let used = false;
  return {
    message: `${context.renewal.fields.title}\nReminder: ${delivery.enabled ? "On" : "Off"}\nRecipients: ${recipients.map((member) => reminderRecipientLabel(member!, context.actorId)).join(", ") || "None"}\nBased on: ${anchor === "renewal" ? "Renewal date" : "Cancellation deadline"}\nWhen: ${date} at ${delivery.localTime} (Europe/Zurich)\n\nRecipient mute settings apply. This does not cancel a contract or change financial history.`,
    confirm: async () => {
      if (used || !current()) return false;
      used = true;
      await save(command);
      return true;
    },
  };
}

function matchesContext(command: typeof SaveRenewalReminder.Type, context: ReminderEditorContext) {
  return (
    !context.renewal.removed &&
    context.renewal.renewalId === command.renewalId &&
    context.renewal.revision === command.expectedRenewalRevision &&
    (context.reminder?.revision ?? null) === command.expectedRevision
  );
}
