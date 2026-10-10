import type { LegacyDismissalContext } from "@nest/contracts/legacy-dismissal-approval";
import type { LegacyDismissalApproval } from "./legacy-dismissal-approval-client.ts";
import type { LegacyDismissalApprovalView } from "./legacy-dismissal-approval-runtime.ts";
import { dismissalText } from "./legacy-dismissal-confirmation.ts";
export function matchesDismissalContext(
  approval: LegacyDismissalApproval,
  current: LegacyDismissalContext | null,
) {
  if (!current || current.approvalId !== approval.id) return false;
  const { draft, reviewToken } = current.review;
  return (
    draft.draftId === approval.input.draftId &&
    draft.ruleId === approval.input.ruleId &&
    reviewToken === approval.input.reviewToken &&
    draft.status === "pending" &&
    draft.sourceKind === "recurring" &&
    draft.eventId === null
  );
}
export function legacyDismissalApprovalText(
  approval: LegacyDismissalApproval,
  current: LegacyDismissalContext | null,
  actor: string,
) {
  if (approval.receipt)
    return (
      dismissalText(approval.receipt.reviewed, actor) + "\n\nThe server confirmed this dismissal."
    );
  if (matchesDismissalContext(approval, current)) return dismissalText(current!.review, actor);
  return [
    `Draft reference: ${approval.input.draftId}`,
    `Rule reference: ${approval.input.ruleId}`,
    approval.status === "denied"
      ? "Declined. No draft was dismissed by this proposal."
      : "The current draft does not match this proposal. Decline it and request a new review.",
  ].join("\n\n");
}
export function legacyDismissalApprovalActions(view: LegacyDismissalApprovalView, now: number) {
  const pending = isPending(view.approval);
  const ready = approvalReady(view);
  const expired = view.approval !== null && Date.parse(view.approval.expiresAt) <= now;
  const decision = ready && pending && view.attempt === null;
  return {
    confirm: decision && canConfirm(view, expired),
    deny: decision,
    ...recoveryActions(view, ready && pending),
    expired: pending && expired,
  };
}
function canConfirm(view: LegacyDismissalApprovalView, expired: boolean) {
  return !expired && view.approval !== null && matchesDismissalContext(view.approval, view.context);
}
function recoveryActions(view: LegacyDismissalApprovalView, ready: boolean) {
  return {
    retry: ready && view.attempt !== null,
    withdraw: ready && view.attempt?.approved === true,
  };
}
function isPending(approval: LegacyDismissalApproval | null) {
  return approval?.status === "pending" || approval?.status === "approved";
}
function approvalReady(view: LegacyDismissalApprovalView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}
