import { MealReminderReceipt } from "@nest/contracts/meal-reminders";
import * as Schema from "effect/Schema";
import type { AssistantAction } from "@nest/contracts/assistant-actions";
import { ChoreReminderReceipt } from "@nest/contracts/chore-reminders";
import { MealProposalGenerationReceipt } from "@nest/contracts/meal-proposals";
export function actionRecordLink(action: AssistantAction, value: object) {
  if (action === "saveMealReminder" && Schema.is(MealReminderReceipt)(value))
    return { pathname: "/meal-reminder" as const, params: { entryId: value.command.entryId } };
  if (action === "saveChoreReminder" && Schema.is(ChoreReminderReceipt)(value))
    return {
      pathname: "/chore-reminder" as const,
      params: { occurrenceId: value.command.occurrenceId },
    };
  if (action === "generateMealProposal" && Schema.is(MealProposalGenerationReceipt)(value))
    return {
      pathname: "/meal-proposal" as const,
      params: { proposalId: value.proposalId, weekStart: value.weekStart },
    };
  return null;
}
