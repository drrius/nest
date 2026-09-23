import type { AssistantAction } from "@nest/contracts/assistant-actions";
export function groceryReminderWriteTools<T>(
  write: (name: AssistantAction, description: string) => T,
) {
  return {
    saveGroceryReminder: write(
      "saveGroceryReminder",
      "Save grocery item reminder settings only when explicitly requested. Read readGroceryReminder first and send its current itemVersion as expectedItemVersion and reminder.revision as expectedRevision (null only when absent). Resolve Me/Partner/Both using readHouseholdRoster; never infer identity from matching names. Clarify unclear recipients or timing, preserve unspecified settings, and state enabled state, recipients, localDate and HH:MM Europe/Zurich time before acting. This applies to this grocery item only, not future repeats. Recipient mute preferences always win; checked, changed or removed groceries invalidate scheduling. Saving settings does not prove notification delivery or change the grocery item. Never invent operation IDs, silently overwrite stale changes, or retry an uncertain save as a new invocation.",
    ),
  };
}
