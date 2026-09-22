import { LegacyDismissalApprovalEnvelope } from "@nest/contracts/legacy-dismissal-approval";
import { ManualCycleApprovalEnvelope } from "@nest/contracts/recurring-manual-approval";
import { VariableCycleApprovalEnvelope } from "@nest/contracts/recurring-variable-approval";
import { RecurringResumeApprovalEnvelope } from "@nest/contracts/recurring-resume-approval";
import { RecurringStateApprovalEnvelope } from "@nest/contracts/recurring-state-approval";
import { RecurringApprovalEnvelope } from "@nest/contracts/recurring-approval";
import { CorrectionApprovalEnvelope } from "@nest/contracts/correction-approval";
import { RefundApprovalEnvelope } from "@nest/contracts/refund-approval";
import { SettlementApprovalEnvelope } from "@nest/contracts/settlement-approval";
import { ExpenseApprovalEnvelope } from "@nest/contracts/expense-approval";
import { agendaHandoff } from "./agenda-handoff.ts";
import { ingredientHandoff } from "./ingredient-handoff.ts";
import {
  MealProposalGenerationReceipt,
  MealProposalGenerationResult,
} from "@nest/contracts/meal-proposals";
import { MealPreparationReceipt } from "@nest/contracts/meal-preparation";
import { LeftoverPlacementReceipt } from "@nest/contracts/meal-leftovers";
import { RecipePlacementReceipt } from "@nest/contracts/recipe-selection";
import { RecipeEditReceipt } from "@nest/contracts/recipe-edit";
import { RecipeCreationReceipt } from "@nest/contracts/recipe-creation";
import { MealMoveReceipt } from "@nest/contracts/meal-move";
import { SetupHandoff } from "@nest/contracts/setup";
import { CalendarSettingsHandoff } from "@nest/contracts/calendar";
import * as Schema from "effect/Schema";
import { MemoryApprovalEnvelope } from "@nest/contracts/memory";
import { AssistantReceipts, type AssistantAction } from "@nest/contracts/assistant-actions";
const Output = Schema.Struct({
  ok: Schema.Boolean,
  value: Schema.optional(Schema.Unknown),
  code: Schema.optional(Schema.String),
});
const labels = {
  proposeLegacyDismissal: "Draft dismissal proposed · not dismissed yet",
  proposeManualCycle: "Expense linkage proposed · not linked yet",
  proposeVariableCycle: "Variable bill proposal created · no expense recorded",
  proposeRecurringResume: "Resumption proposal created · this action changed no rule or expense",
  proposeRecurringState:
    "Recurring state proposal created · this action changed no rule or expense",
  proposeRecurring: "Recurring proposal created · this action saved no rule or expense",
  proposeCorrection: "Correction proposal created · this action posted no money",
  proposeRefund: "Refund proposal created · this action posted no money",
  proposeSettlement: "Settlement proposal created · this action posted no money",
  proposeExpense: "Expense proposal created · this action posted no money",
  generateMealProposal: "Preview requested · open its current state",
  replaceProposalMeal: "Suggestion replacement requested · read the preview for its result",
  chooseProposalRecipe: "Saved recipe choice requested · read the preview for its result",
  discardMealProposal: "Proposal discard confirmed",
  editMealPreparation: "Meal preparation edit confirmed",
  createMealPreparation: "Meal preparation created",
  placeLeftovers: "Leftovers added to the week",
  placeRecipe: "Recipe added to the week",
  replaceWithRecipe: "Recipe replacement confirmed",
  editRecipe: "Recipe edit confirmed",
  archiveRecipe: "Recipe archive confirmed",
  createRecipe: "Recipe saved",
  moveMeal: "Meal moved",
  replaceMeal: "Meal replaced",
  placeMeal: "Meal added to the week",
  removeMeal: "Meal removed from the week",
  requestChoreTransfer: "Handover requested",
  respondChoreTransfer: "Handover response saved",
  skipChore: "Chore skipped",
  rescheduleChore: "Chore rescheduled",
  setRoutineState: "Routine state updated",
  createRoutine: "Routine created",
  editRoutine: "Routine updated",
  saveNotificationPreferences: "Your notification preferences saved",
  proposeMemory: "Review memory proposal",
  removeMemory: "Saved memory deleted",
  saveCookingPreferences: "Household cooking preferences saved",
  saveFoodPreferences: "Your food preferences saved",
  completeChore: "Chore completed",
  addGrocery: "Grocery added",
  editGrocery: "Grocery updated",
  removeGrocery: "Grocery removed",
  checkGrocery: "Grocery checked",
};
const destinations = {
  proposeLegacyDismissal: "/finances",
  proposeManualCycle: "/finances",
  proposeVariableCycle: "/finances",
  proposeRecurringResume: "/finances",
  proposeRecurringState: "/finances",
  proposeRecurring: "/finances",
  proposeCorrection: "/finances",
  proposeRefund: "/finances",
  proposeSettlement: "/finances",
  proposeExpense: "/finances",
  generateMealProposal: "/meals",
  replaceProposalMeal: "/meals",
  chooseProposalRecipe: "/meals",
  discardMealProposal: "/meals",
  editMealPreparation: "/meal-week",
  createMealPreparation: "/meal-week",
  placeLeftovers: "/meal-week",
  placeRecipe: "/meal-week",
  replaceWithRecipe: "/meal-week",
  editRecipe: "/meal-library",
  archiveRecipe: "/meal-library",
  createRecipe: "/meal-library",
  moveMeal: "/meal-week",
  replaceMeal: "/meal-week",
  placeMeal: "/meal-week",
  removeMeal: "/meal-week",
  requestChoreTransfer: "/chore-transfers",
  respondChoreTransfer: "/chore-transfers",
  skipChore: "/household",
  rescheduleChore: "/household",
  setRoutineState: "/routines",
  createRoutine: "/routines",
  editRoutine: "/routines",
  saveNotificationPreferences: "/notification-preferences",
  proposeMemory: "/memory",
  removeMemory: "/memory",
  saveCookingPreferences: "/cooking-preferences",
  saveFoodPreferences: "/food-preferences",
  completeChore: "/household",
  addGrocery: "/checklist",
  editGrocery: "/checklist",
  removeGrocery: "/checklist",
  checkGrocery: "/checklist",
} as const;
const handoffs = {
  "tool-openCalendarAgenda": agendaHandoff,
  "tool-openMealIngredientReview": ingredientHandoff,
  "tool-readMealProposal": proposalHandoff,
  "tool-openCalendarSettings": calendarHandoff,
  "tool-openSetup": setupHandoff,
};
export function actionResult(part: { type: string; state?: unknown; output?: unknown }) {
  if (Object.hasOwn(handoffs, part.type)) return handoffs[part.type as keyof typeof handoffs](part);
  const name = part.type.slice(5);
  if (!part.type.startsWith("tool-") || !Object.hasOwn(AssistantReceipts, name)) return null;
  const action = name as AssistantAction;
  const href = destinations[action];
  const uncertain = { label: "Reload saved conversation to verify this action.", href };
  if (part.state !== "output-available" || !Schema.is(Output)(part.output)) return uncertain;
  const output = part.output;
  if (!output.ok)
    return {
      label: failureLabel(action, output.code, uncertain.label),
      href: failureHref(action, output.code),
    };
  const schema: Schema.Codec<object> = AssistantReceipts[action];
  if (!Schema.is(schema)(output.value)) return uncertain;
  return { label: successLabel(action, output.value), href: successHref(action, output.value) };
}
function failureHref(action: AssistantAction, code: string | undefined) {
  return action === "createRecipe" && code === "native_required"
    ? ("/recipe-create" as const)
    : destinations[action];
}
function failureLabel(action: AssistantAction, code: string | undefined, fallback: string) {
  if (code === "native_required" && action === "editRecipe")
    return "This recipe edit is too large for chat. Open the saved recipe library to edit it; nothing was saved.";
  if (code === "native_required")
    return "This recipe is too large for chat. Open the native recipe form; nothing was saved.";
  if (code === "conflict")
    return "This item changed. Review its current state before trying again.";
  return code === "forbidden" ? "This action was not permitted." : fallback;
}
function successLabel(action: AssistantAction, receipt: object) {
  if (action === "respondChoreTransfer" && "action" in receipt)
    return receipt.action === "accept" ? "Handover accepted" : "Handover declined";
  if (action === "setRoutineState") return routineStateLabel(receipt);
  if ("outcome" in receipt && receipt.outcome === "already_completed")
    return "Chore was already completed";
  if (action === "checkGrocery" && "checked" in receipt && !receipt.checked)
    return "Grocery unchecked";
  return labels[action];
}

function successHref(action: AssistantAction, value: object) {
  if (action === "generateMealProposal" && Schema.is(MealProposalGenerationReceipt)(value))
    return {
      pathname: "/meal-proposal" as const,
      params: { proposalId: value.proposalId, weekStart: value.weekStart },
    };
  if (isSelectionResult(action, value))
    return {
      pathname: "/planned-recipe" as const,
      params: { entryId: value.entryId, weekStart: value.weekStart, revision: value.revision },
    };
  // actionResult already validates the complete action-specific receipt.
  if (isRecipeResult(action, value))
    return {
      pathname: "/saved-meal" as const,
      params: { definitionId: value.definitionId, expectedRevision: value.revision },
    };
  const meal = mealHref(action, value);
  if (meal) return meal;
  const financial = financialHref(action, value);
  if (financial) return financial;
  if (action === "proposeMemory" && Schema.is(MemoryApprovalEnvelope)(value))
    return { pathname: "/memory" as const, params: { approvalId: value.approval.id } };
  return destinations[action];
}

function calendarHandoff(part: { state?: unknown; output?: unknown }) {
  if (
    part.state !== "output-available" ||
    !Schema.is(Output)(part.output) ||
    !part.output.ok ||
    !Schema.is(CalendarSettingsHandoff)(part.output.value)
  )
    return null;
  return {
    label: "Choose calendar access and sharing on your iPhone",
    href: "/calendar-sharing" as const,
  };
}

function setupHandoff(part: { state?: unknown; output?: unknown }) {
  if (
    part.state !== "output-available" ||
    !Schema.is(Output)(part.output) ||
    !part.output.ok ||
    !Schema.is(SetupHandoff)(part.output.value)
  )
    return null;
  return { label: "Continue your setup on your iPhone", href: "/setup" as const };
}

function routineStateLabel(receipt: object) {
  if ("action" in receipt) {
    if (receipt.action === "pause") return "Routine paused";
    if (receipt.action === "resume") return "Routine resumed";
    if (receipt.action === "archive") return "Routine archived";
  }
  return labels.setRoutineState;
}

function isRecipeResult(
  action: AssistantAction,
  value: object,
): value is RecipeCreationReceipt | RecipeEditReceipt {
  return (
    (action === "createRecipe" && Schema.is(RecipeCreationReceipt)(value)) ||
    (action === "editRecipe" && Schema.is(RecipeEditReceipt)(value))
  );
}

function isSelectionResult(
  action: AssistantAction,
  value: object,
): value is RecipePlacementReceipt {
  return (
    ["placeRecipe", "replaceWithRecipe"].includes(action) &&
    Schema.is(RecipePlacementReceipt)(value)
  );
}

function mealHref(action: AssistantAction, value: object) {
  if (
    ["createMealPreparation", "editMealPreparation"].includes(action) &&
    Schema.is(MealPreparationReceipt)(value)
  )
    return {
      pathname: "/meal-preparation" as const,
      params: { entryId: value.entryId, weekStart: value.weekStart },
    };
  if (
    ["replaceMeal", "removeMeal", "placeMeal"].includes(action) &&
    "weekStart" in value &&
    typeof value.weekStart === "string"
  )
    return { pathname: "/meal-week" as const, params: { weekStart: value.weekStart } };
  if (action === "placeLeftovers" && Schema.is(LeftoverPlacementReceipt)(value))
    return {
      pathname: "/planned-recipe" as const,
      params: {
        entryId: value.entryId,
        weekStart: value.targetWeekStart,
        revision: value.targetRevision,
      },
    };
  if (action === "moveMeal" && Schema.is(MealMoveReceipt)(value))
    return { pathname: "/meal-week" as const, params: { weekStart: value.targetWeekStart } };
  return null;
}

function proposalHandoff(part: { state?: unknown; output?: unknown }) {
  if (
    part.state !== "output-available" ||
    !Schema.is(Output)(part.output) ||
    !part.output.ok ||
    !Schema.is(MealProposalGenerationResult)(part.output.value)
  )
    return null;
  const proposal = part.output.value.envelope.proposal;
  return {
    label: "Open current private preview · approval is on your iPhone",
    href: {
      pathname: "/meal-proposal" as const,
      params: { proposalId: proposal.proposalId, weekStart: proposal.weekStart },
    },
  };
}

function financialHref(action: AssistantAction, value: object) {
  const recurring = recurringHref(action, value);
  if (recurring) return recurring;
  if (action === "proposeCorrection" && Schema.is(CorrectionApprovalEnvelope)(value))
    return { pathname: "/correction-approval" as const, params: { approvalId: value.approval.id } };
  if (action === "proposeRefund" && Schema.is(RefundApprovalEnvelope)(value))
    return { pathname: "/refund-approval" as const, params: { approvalId: value.approval.id } };
  if (action === "proposeSettlement" && Schema.is(SettlementApprovalEnvelope)(value))
    return { pathname: "/settlement-approval" as const, params: { approvalId: value.approval.id } };
  if (action === "proposeExpense" && Schema.is(ExpenseApprovalEnvelope)(value))
    return { pathname: "/expense-approval" as const, params: { approvalId: value.approval.id } };
  return null;
}

function recurringHref(action: AssistantAction, value: object) {
  const cycle = cycleHref(action, value);
  if (cycle) return cycle;
  if (action === "proposeRecurringResume")
    return Schema.is(RecurringResumeApprovalEnvelope)(value)
      ? {
          pathname: "/recurring-resume-approval" as const,
          params: { approvalId: value.approval.id },
        }
      : null;
  if (action === "proposeRecurringState")
    return Schema.is(RecurringStateApprovalEnvelope)(value)
      ? {
          pathname: "/recurring-state-approval" as const,
          params: { approvalId: value.approval.id },
        }
      : null;
  if (action !== "proposeRecurring") return null;
  return Schema.is(RecurringApprovalEnvelope)(value)
    ? { pathname: "/recurring-approval" as const, params: { approvalId: value.approval.id } }
    : null;
}

function cycleHref(action: AssistantAction, value: object) {
  if (action === "proposeLegacyDismissal")
    return Schema.is(LegacyDismissalApprovalEnvelope)(value)
      ? {
          pathname: "/legacy-dismissal-approval" as const,
          params: { approvalId: value.approval.id },
        }
      : null;
  if (action === "proposeManualCycle")
    return Schema.is(ManualCycleApprovalEnvelope)(value)
      ? {
          pathname: "/recurring-manual-approval" as const,
          params: { approvalId: value.approval.id },
        }
      : null;
  if (action === "proposeVariableCycle")
    return Schema.is(VariableCycleApprovalEnvelope)(value)
      ? {
          pathname: "/recurring-variable-approval" as const,
          params: { approvalId: value.approval.id },
        }
      : null;
  return null;
}
