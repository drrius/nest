import type { ManualCycleContext } from "@nest/contracts/recurring-manual-context";
import type { ManualCycleApproval } from "./recurring-manual-approval-client.ts";
import type { ManualCycleApprovalView } from "./recurring-manual-approval-runtime.ts";
import { dueManualCycle, manualConfirmationText } from "./recurring-manual-confirmation.ts";
export function manualCycleSuperseded(
  approval: ManualCycleApproval,
  current: ManualCycleContext | null,
) {
  if (!current || current.approvalId !== approval.id) return false;
  const rule = current.target.rule;
  return (
    current.linked ||
    current.detail.reversedById !== null ||
    rule.revision !== approval.input.expectedRevision ||
    (rule.coveredThrough !== null && rule.coveredThrough >= approval.input.dueOn) ||
    (rule.nextDueOn !== null && rule.nextDueOn > approval.input.dueOn)
  );
}
export function matchesManualCycleContext(
  approval: ManualCycleApproval,
  current: ManualCycleContext | null,
) {
  if (!current || manualCycleSuperseded(approval, current)) return false;
  const cycle = dueManualCycle(current.target.rule, current.target.today);
  return (
    current.approvalId === approval.id &&
    current.target.rule.ruleId === approval.input.ruleId &&
    current.detail.event.eventId === approval.input.sourceEventId &&
    cycle?.dueOn === approval.input.dueOn &&
    ["expense", "replacement"].includes(current.detail.event.kind) &&
    current.detail.event.occurredOn >= cycle.startsOn &&
    current.detail.event.occurredOn <= cycle.through
  );
}
export function manualCycleApprovalText(
  approval: ManualCycleApproval,
  current: ManualCycleContext | null,
  actor: string,
) {
  const receipt = approval.receipt;
  if (receipt)
    return (
      manualConfirmationText(
        {
          detail: receipt.linkedExpense,
          target: { rule: { ruleId: receipt.input.ruleId, configuration: receipt.configuration } },
          cycle: receipt.cycle,
        },
        actor,
      ) + "\n\nThe server confirmed this linkage. This cycle is consumed."
    );
  if (matchesManualCycleContext(approval, current))
    return manualConfirmationText(
      { ...current!, cycle: dueManualCycle(current!.target.rule, current!.target.today)! },
      actor,
    );
  return [
    `Expense reference: ${approval.input.sourceEventId}`,
    `Rule reference: ${approval.input.ruleId}`,
    `Due ${approval.input.dueOn}`,
    approval.status === "denied"
      ? "Declined. No cycle was linked by this proposal."
      : "The current expense or rule does not match this proposal. Decline it and request a new review.",
  ].join("\n\n");
}
export function manualCycleApprovalActions(view: ManualCycleApprovalView, now: number) {
  const pending = isPending(view.approval);
  const valid = unexpired(view.approval, now);
  const ready = approvalReady(view);
  const decision = ready && pending && valid && view.attempt === null;
  return {
    confirm:
      decision && view.approval !== null && matchesManualCycleContext(view.approval, view.context),
    deny: decision,
    retry: ready && pending && view.attempt !== null,
    expired: pending && !valid,
  };
}

function isPending(approval: ManualCycleApproval | null) {
  return approval?.status === "pending" || approval?.status === "approved";
}
function unexpired(approval: ManualCycleApproval | null, now: number) {
  return approval !== null && Date.parse(approval.expiresAt) > now;
}
function approvalReady(view: ManualCycleApprovalView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}
