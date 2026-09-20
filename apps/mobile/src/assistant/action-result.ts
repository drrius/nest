import * as Schema from "effect/Schema";
import { AssistantReceipts, type AssistantAction } from "@nest/contracts/assistant-actions";
const Output = Schema.Struct({
  ok: Schema.Boolean,
  value: Schema.optional(Schema.Unknown),
  code: Schema.optional(Schema.String),
});
const labels = {
  completeChore: "Chore completed",
  addGrocery: "Grocery added",
  editGrocery: "Grocery updated",
  removeGrocery: "Grocery removed",
  checkGrocery: "Grocery checked",
};
export function actionResult(part: { type: string; state?: unknown; output?: unknown }) {
  const name = part.type.slice(5);
  if (!part.type.startsWith("tool-") || !Object.hasOwn(AssistantReceipts, name)) return null;
  const action = name as AssistantAction;
  const href = action === "completeChore" ? ("/household" as const) : ("/checklist" as const);
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
  return { label: successLabel(action, output.value), href };
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
