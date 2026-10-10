import type { CorrectionApproval } from "./correction-approval-client.ts";
import type { CorrectionApprovalView } from "./correction-approval-runtime.ts";
import type { CorrectionContext } from "@nest/contracts/correction-context";
import { correctionReview } from "./correction-review.ts";
export function matchesCorrectionContext(
  approval: CorrectionApproval,
  context: CorrectionContext | null,
) {
  if (!context || context.source.event.eventId !== approval.correction.sourceEventId) return false;
  return (
    context.source.reversedById === approval.correction.expectedReversalId &&
    (approval.correction.replacement === null ? context.canReverse : context.canReplace)
  );
}
export function correctionConfirmation(
  approval: CorrectionApproval,
  context: CorrectionContext,
  actor: string,
) {
  return correctionReview(approval.correction, context, actor);
}
const isPending = (approval: CorrectionApproval | null) =>
  approval?.status === "pending" || approval?.status === "approved";
const unexpired = (approval: CorrectionApproval | null, now: number) =>
  approval !== null && Date.parse(approval.expiresAt) > now;
const ready = (view: CorrectionApprovalView) =>
  view.active && view.online && view.fresh && !view.busy && !view.verify;
export function approvalActions(view: CorrectionApprovalView, now: number) {
  const pending = isPending(view.approval);
  const valid = unexpired(view.approval, now);
  const loaded = ready(view);
  const decision = loaded && pending && !view.attempt && valid;
  return {
    confirm:
      decision && view.approval !== null && matchesCorrectionContext(view.approval, view.context),
    deny: decision,
    retry: loaded && pending && view.attempt !== null,
    expired: pending && !valid,
  };
}
