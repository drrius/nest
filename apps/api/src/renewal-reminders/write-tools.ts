import type { AssistantAction } from "@nest/contracts/assistant-actions";
export function renewalReminderWriteTools<T>(
  write: (name: AssistantAction, description: string) => T,
) {
  return {
    saveRenewalReminder: write(
      "saveRenewalReminder",
      "Save only reminder settings the user explicitly requests. Read the current renewal and reminder first; send both exact revisions (expectedRevision=null only when no settings exist). Resolve recipients from readHouseholdRoster; distinguish the current user from their partner even when names match. Ask when recipients, timing or anchor are unclear. Preserve unspecified settings and state recipients, enabled state, anchor, daysBefore and HH:MM Europe/Zurich time before acting. Recipient mute preferences always win. This records settings, not proof of delivery, cancellation or payment. Never invent operation IDs or overwrite stale changes; recover uncertain outcomes through the original invocation.",
    ),
  };
}
