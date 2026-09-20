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
      href,
    };
  const schema: Schema.Codec<object> = AssistantReceipts[action];
  if (!Schema.is(schema)(output.value)) return uncertain;
  return { label: successLabel(action, output.value), href: successHref(action, output.value) };
}
function failureLabel(code: string | undefined, fallback: string) {
  if (code === "conflict")
    return "This item changed. Review its current state before trying again.";
  return code === "forbidden" ? "This action was not permitted." : fallback;
}
function successLabel(action: AssistantAction, receipt: object) {
  if ("outcome" in receipt && receipt.outcome === "already_completed")
    return "Chore was already completed";
  if (action === "checkGrocery" && "checked" in receipt && !receipt.checked)
    return "Grocery unchecked";
  return labels[action];
}

function successHref(action: AssistantAction, value: object) {
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
