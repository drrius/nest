import type { SettlementApproval } from "./settlement-approval-client.ts";
import type { SettlementApprovalView } from "./settlement-approval-runtime.ts";
import { formatChf } from "./format.ts";
export const memberLabel = (memberId: string, actor: string) =>
  memberId === actor ? "You" : "Your partner";
export function settlementConfirmation(approval: SettlementApproval, actor: string) {
  const value = approval.settlement;
  return `${value.description}\n${formatChf(value.amountCentimes)} · ${value.date}\n${memberLabel(value.payerId, actor)} → ${memberLabel(value.recipientId, actor)}\n${value.mode === "full" ? "Full settlement" : "Partial settlement"}\nReviewed outstanding: ${formatChf(value.expectedOutstandingCentimes)}\n\nConfirming records this settlement in shared financial history. Nest does not transfer money. A changed balance requires a new review.`;
}
const isPending = (approval: SettlementApproval | null) =>
  approval?.status === "pending" || approval?.status === "approved";
const unexpired = (approval: SettlementApproval | null, now: number) =>
  approval !== null && Date.parse(approval.expiresAt) > now;
const ready = (view: SettlementApprovalView) =>
  view.active && view.online && view.fresh && !view.busy && !view.verify;
export function approvalActions(view: SettlementApprovalView, now: number) {
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
