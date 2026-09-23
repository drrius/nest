import type { AssistantAction } from "@nest/contracts/assistant-actions";
export function choreReminderWriteTools<T>(
  write: (name: AssistantAction, description: string) => T,
) {
  return {
    saveChoreReminder: write(
      "saveChoreReminder",
      "Save chore reminder settings only when explicitly requested. Read readChoreReminder first and send its current itemRevision as expectedItemRevision and reminder.revision as expectedRevision (null only when absent). Resolve Me/Partner/Both using readHouseholdRoster; never infer identity from matching names. Clarify unclear recipients or timing, preserve unspecified settings, and state enabled state, recipients, daysBefore and HH:MM Europe/Zurich time before acting. This applies to this occurrence only, not future repeats. Recipient mute preferences always win; changed or completed chores invalidate scheduling. Saving settings does not prove notification delivery or complete the chore. Never invent operation IDs, silently overwrite stale changes, or retry an uncertain save as a new invocation.",
    ),
  };
}
