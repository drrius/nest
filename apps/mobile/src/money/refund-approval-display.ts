import type { RefundApproval } from "./refund-approval-client.ts";
import type { RefundApprovalView } from "./refund-approval-runtime.ts";
import { formatChf } from "./format.ts";
export const memberLabel = (memberId: string, actor: string) =>
  memberId === actor ? "You" : "Your partner";
export function refundConfirmation(approval: RefundApproval, actor: string) {
  const value = approval.refund;
  const shares = value.allocations
    .map((share) => `${memberLabel(share.memberId, actor)}: ${formatChf(share.centimes)}`)
    .join("\n");
  const remaining = value.expectedRemaining
    .map((share) => `${memberLabel(share.memberId, actor)}: ${formatChf(share.centimes)}`)
    .join("\n");
  return `${value.description}\n${formatChf(value.amountCentimes)} · ${value.date}\nOriginal payer: ${memberLabel(value.payerId, actor)}\nRefunded shares\n${shares}\nReviewed remaining shares\n${remaining}\n${value.note ?? ""}\n\nConfirm only a refund already received outside Nest. The original expense stays in shared financial history. Changed remaining shares require a new review.`;
}
const isPending = (approval: RefundApproval | null) =>
  approval?.status === "pending" || approval?.status === "approved";
const unexpired = (approval: RefundApproval | null, now: number) =>
  approval !== null && Date.parse(approval.expiresAt) > now;
const ready = (view: RefundApprovalView) =>
  view.active && view.online && view.fresh && !view.busy && !view.verify;
export function approvalActions(view: RefundApprovalView, now: number) {
  const pending = isPending(view.approval);
  const valid = unexpired(view.approval, now);
  const loaded = ready(view);
  const decision = loaded && pending && !view.attempt && valid;
  return {
    confirm: decision,
    deny: decision,
    retry: loaded && pending && view.attempt !== null,
    expired: pending && !valid,
  };
}
