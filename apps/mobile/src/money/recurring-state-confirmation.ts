import { recurringStateSummary } from "./recurring-state-summary.ts";
import type { RecurringRule } from "@nest/contracts/recurring-read";
import type { RecurringStateInput } from "@nest/contracts/recurring-state";
import type { RecurringReadView } from "./recurring-read-runtime.ts";
import type { RecurringStateSaveView } from "./recurring-state-save-runtime.ts";
import { stateSaveAttempt } from "./recurring-state-save-attempt.ts";
export function stateRequestEnabled(view: RecurringStateSaveView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}
export function currentStateRule(read: RecurringReadView, save: RecurringStateSaveView) {
  if (!stateRequestEnabled(save) || save.attempt || save.result) return null;
  if (!read.active || !read.online || read.busy || read.verify) return null;
  return read.entry?.kind === "detail" ? read.entry.value.rule : null;
}
export function prepareStateConfirmation(
  rule: RecurringRule,
  action: RecurringStateInput["action"],
  operationId: string,
) {
  if (rule.status === "cancelled" || (action === "pause" && rule.status !== "active")) return null;
  const command = stateSaveAttempt({
    operationId,
    change: {
      ruleId: rule.ruleId,
      expectedRevision: rule.revision,
      expectedStatus: rule.status,
      action,
    },
  }).command;
  return { rule, command };
}
export function stateConfirmationCurrent(
  expected: { rule: RecurringRule },
  read: RecurringReadView,
  save: RecurringStateSaveView,
) {
  return currentStateRule(read, save) === expected.rule;
}
export function stateConfirmationText(
  rule: RecurringRule,
  action: RecurringStateInput["action"],
  actor: string,
) {
  return [
    recurringStateSummary(rule, actor),
    action === "pause"
      ? "Pause future recurring expense recording. Resuming later requires a separate decision."
      : "Permanently cancel this recurring rule. It cannot be resumed or edited after cancellation.",
    "Already recorded expenses and financial history remain. A cycle recorded before this change completes is not reversed.",
    "Scheduled posting is not active yet. This action records no expense.",
  ].join("\n\n");
}
