import type { SaveRenewalReminder } from "@nest/contracts/reminders";
import type { ReminderEditorContext } from "./editor-context.ts";
export function reminderRecoveryReview(
  command: typeof SaveRenewalReminder.Type,
  renewalId: string,
  context: ReminderEditorContext | null,
) {
  if (command.renewalId !== renewalId) return { target: command.renewalId, summary: null };
  const matching = context?.renewal.renewalId === command.renewalId ? context : null;
  const title = matching?.renewal.fields.title ?? `Renewal ${command.renewalId}`;
  const { delivery, anchor } = command.settings;
  const names = delivery.recipientIds.map(
    (id) =>
      matching?.members.find((member) => member.actorId === id)?.displayName ?? `Member ${id}`,
  );
  return {
    target: null,
    summary: `${title}\nPending reminder: ${delivery.enabled ? "On" : "Off"}\nRecipients: ${names.join(", ") || "None"}\n${delivery.daysBefore} days before ${anchor === "renewal" ? "renewal date" : "cancellation deadline"}, at ${delivery.localTime} (Europe/Zurich).\nThese are the original pending settings. Recipient mute settings apply.`,
  };
}
