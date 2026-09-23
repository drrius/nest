import type { AssistantAction } from "@nest/contracts/assistant-actions";
export function recurringReminderWriteTools<T>(
  write: (name: AssistantAction, description: string) => T,
) {
  return {
    saveRecurringReminder: write(
      "saveRecurringReminder",
      "Save recurring expense reminder settings only when explicitly requested. Read readRecurringReminder first; use rule.revision as expectedRuleRevision, rule.nextDueOn as expectedDueOn and reminder.revision as expectedRevision (null only when absent). Resolve recipients through readHouseholdRoster. Clarify ambiguous recipients or timing; preserve unspecified settings. State the rule reference, enabled state, recipients, daysBefore and HH:MM Europe/Zurich time before acting. Recipient mute preferences win. This cannot approve a financial mandate, post an expense, pay a bill or change the rule. Saving settings does not prove delivery. Never invent operation IDs or repeat an uncertain save as a new invocation.",
    ),
  };
}
