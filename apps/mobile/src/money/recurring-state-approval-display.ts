import type { RecurringRule } from "@nest/contracts/recurring-read";
import type { RecurringStateApproval } from "./recurring-state-approval-client.ts";
import type { RecurringStateApprovalView } from "./recurring-state-approval-runtime.ts";
export function recurringStateRevisionSuperseded(
  approval: RecurringStateApproval,
  current: RecurringRule | null,
) {
  return (
    current !== null &&
    current.ruleId === approval.change.ruleId &&
    current.revision !== approval.change.expectedRevision
  );
}
export function matchesRecurringStateContext(
  approval: RecurringStateApproval,
  current: RecurringRule | null,
) {
  const change = approval.change;
  return (
    current !== null &&
    current.ruleId === change.ruleId &&
    current.revision === change.expectedRevision &&
    current.status === change.expectedStatus
  );
}
export function recurringStateApprovalText(
  approval: RecurringStateApproval,
  current: RecurringRule | null,
) {
  return [
    current?.configuration.description ?? "Recurring expense",
    `Requested action: ${approval.change.action}. Reviewed status: ${approval.change.expectedStatus}.`,
    approval.change.action === "pause"
      ? "Pause future recording. Resuming requires a separate decision."
      : "Permanently cancel this rule. It cannot be edited or resumed after cancellation.",
    "Existing financial history remains. A cycle recorded before this change completes is not reversed.",
    "Scheduled posting is not active yet. This decision records no expense.",
  ].join("\n\n");
}
export function recurringStateApprovalActions(view: RecurringStateApprovalView, now: number) {
  const pending = isPending(view.approval);
  const valid = unexpired(view.approval, now);
  const ready = isReady(view);
  const decision = ready && pending && valid && view.attempt === null;
  return {
    confirm:
      decision &&
      view.approval !== null &&
      matchesRecurringStateContext(view.approval, view.context),
    deny: decision,
    retry: ready && pending && view.attempt !== null,
    expired: pending && !valid,
  };
}

const isPending = (approval: RecurringStateApproval | null) =>
  approval?.status === "pending" || approval?.status === "approved";
const unexpired = (approval: RecurringStateApproval | null, now: number) =>
  approval !== null && Date.parse(approval.expiresAt) > now;
const isReady = (view: RecurringStateApprovalView) =>
  view.active && view.online && view.fresh && !view.busy && !view.verify;
