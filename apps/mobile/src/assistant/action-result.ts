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
export function actionResult(part: { type: string; state?: unknown; output?: unknown }) {
  if (part.type === "tool-openCalendarSettings") return calendarHandoff(part);
  if (part.type === "tool-openSetup") return setupHandoff(part);
  const name = part.type.slice(5);
  if (!part.type.startsWith("tool-") || !Object.hasOwn(AssistantReceipts, name)) return null;
  const action = name as AssistantAction;
  const href = destinations[action];
  const uncertain = { label: "Reload saved conversation to verify this action.", href };
  if (part.state !== "output-available" || !Schema.is(Output)(part.output)) return uncertain;
  const output = part.output;
  if (!output.ok)
    return {
      label: failureLabel(output.code, uncertain.label),
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
function failureLabel(code: string | undefined, fallback: string) {
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
  // actionResult already validates the complete action-specific receipt.
  if (action === "createRecipe" && Schema.is(RecipeCreationReceipt)(value))
    return {
      pathname: "/saved-meal" as const,
      params: { definitionId: value.definitionId, expectedRevision: value.revision },
    };
  if (
    ["replaceMeal", "removeMeal", "placeMeal"].includes(action) &&
    "weekStart" in value &&
    typeof value.weekStart === "string"
  )
    return { pathname: "/meal-week" as const, params: { weekStart: value.weekStart } };
  if (action === "moveMeal" && Schema.is(MealMoveReceipt)(value))
    return { pathname: "/meal-week" as const, params: { weekStart: value.targetWeekStart } };
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
