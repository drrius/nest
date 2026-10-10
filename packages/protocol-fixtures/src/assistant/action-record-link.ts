import { RecurringReminderReceipt } from "@nest/contracts/recurring-reminders";
import { GroceryReminderReceipt } from "@nest/contracts/grocery-reminders";
import { MealReminderReceipt } from "@nest/contracts/meal-reminders";
import * as Schema from "effect/Schema";
import type { AssistantAction } from "@nest/contracts/assistant-actions";
import { ChoreReminderReceipt } from "@nest/contracts/chore-reminders";
import { MealProposalGenerationReceipt } from "@nest/contracts/meal-proposals";
export function actionRecordLink(action: AssistantAction, value: object) {
  if (action === "generateMealProposal" && Schema.is(MealProposalGenerationReceipt)(value))
    return {
      pathname: "/meal-proposal" as const,
      params: { proposalId: value.proposalId, weekStart: value.weekStart },
    };
  return reminderRecordLink(action, value);
}

function reminderRecordLink(action: AssistantAction, value: object) {
  if (action === "saveRecurringReminder" && Schema.is(RecurringReminderReceipt)(value))
    return { pathname: "/recurring-reminder" as const, params: { ruleId: value.command.ruleId } };
  if (action === "saveGroceryReminder" && Schema.is(GroceryReminderReceipt)(value))
    return { pathname: "/grocery-reminder" as const, params: { itemId: value.command.itemId } };
  if (action === "saveMealReminder" && Schema.is(MealReminderReceipt)(value))
    return { pathname: "/meal-reminder" as const, params: { entryId: value.command.entryId } };
  if (action === "saveChoreReminder" && Schema.is(ChoreReminderReceipt)(value))
    return {
      pathname: "/chore-reminder" as const,
      params: { occurrenceId: value.command.occurrenceId },
    };
  return null;
}
