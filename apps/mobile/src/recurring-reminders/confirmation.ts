import * as Schema from "effect/Schema";
import {
  SaveRecurringReminder,
  canonicalRecurringReminder,
} from "@nest/contracts/recurring-reminders";
import { renewalDeadline } from "@nest/domain/renewals";
import { reminderRecipientLabel } from "../renewal-reminders/recipient-label.ts";
import type { ReminderEditorContext } from "./editor-context.ts";
export function reminderConfirmation(
  input: typeof SaveRecurringReminder.Type,
  context: ReminderEditorContext,
  current: () => boolean,
  save: (command: typeof SaveRecurringReminder.Type) => Promise<void>,
) {
  const command = canonicalRecurringReminder(
    Schema.decodeUnknownSync(SaveRecurringReminder)(input, { onExcessProperty: "error" }),
  );
  if (!matchesReviewedRule(command, context)) return null;
  const settings = command.settings;
  const recipients = settings.recipientIds.map((id) =>
    context.members.find((member) => member.actorId === id),
  );
  if (recipients.some((member) => !member)) return null;
  const date = renewalDeadline(command.expectedDueOn, settings.daysBefore);
  if (!date) return null;
  let used = false;
  return {
    message: `${context.rule.configuration.description}\nRule reference: ${command.ruleId}\nReminder: ${settings.enabled ? "On" : "Off"}\nRecipients: ${recipients.map((member) => reminderRecipientLabel(member!, context.actorId)).join(", ") || "None"}\nNext reminder: ${date} at ${settings.localTime} (Europe/Zurich)\n\nThis changes reminder settings only, not the financial rule or ledger. Recipient mute settings apply to each reminder.`,
    confirm: async () => {
      if (used || !current()) return false;
      used = true;
      await save(command);
      return true;
    },
  };
}

function matchesReviewedRule(
  command: typeof SaveRecurringReminder.Type,
  context: ReminderEditorContext,
) {
  return (
    context.rule.ruleId === command.ruleId &&
    context.rule.revision === command.expectedRuleRevision &&
    context.rule.nextDueOn === command.expectedDueOn &&
    context.rule.status === "active" &&
    (context.reminder?.revision ?? null) === command.expectedRevision
  );
}
