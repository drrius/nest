import type { VariableAmountDraft } from "./recurring-variable-draft.ts";
import type { VariableCycleSaveView } from "./recurring-variable-save-runtime.ts";
export function variableLeavePolicy(draft: VariableAmountDraft, view: VariableCycleSaveView) {
  if (view.busy || view.attempt !== null) return "pending";
  if (view.result && view.result.status !== "unresolved") return "quiet";
  return draft.amount !== "" ||
    draft.split !== "equal" ||
    draft.firstExact !== "" ||
    draft.secondExact !== "" ||
    draft.firstPercent !== "50"
    ? "draft"
    : "quiet";
}
