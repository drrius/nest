import type { LegacyAdoptionApprovalContext } from "./legacy-adoption-approval-operations.ts";
import type { LegacyAdoptionApproval } from "./legacy-adoption-approval-client.ts";
import type { LegacyAdoptionApprovalView } from "./legacy-adoption-approval-runtime.ts";
import { adoptionSourceText, adoptionConfirmationText } from "./legacy-adoption-summary.ts";
import * as Schema from "effect/Schema";
import { LegacyAdoptionInput } from "@nest/contracts/legacy-adoption-command";
const sameInput = Schema.toEquivalence(LegacyAdoptionInput);
export function matchesAdoptionContext(
  approval: LegacyAdoptionApproval,
  current: LegacyAdoptionApprovalContext | null,
) {
  if (!current || current.approvalId !== approval.id || !sameInput(approval.input, current.input))
    return false;
  const id = approval.input.configuration.categoryId;
  if (id !== null && (current.category?.categoryId !== id || current.category.archived))
    return false;
  return (
    current.review.rule.ruleId === approval.input.ruleId &&
    current.review.reviewToken === approval.input.reviewToken &&
    current.review.blockers.length === 0
  );
}
export function legacyAdoptionApprovalText(
  approval: LegacyAdoptionApproval,
  current: LegacyAdoptionApprovalContext | null,
  actor: string,
) {
  return [
    originalTerms(approval, current, actor),
    "New configuration proposed for authorization",
    adoptionConfirmationText(
      { operationId: approval.operationId, input: approval.input },
      actor,
      (approval.receipt?.reviewed ?? current?.review)?.coveredThrough,
    ),
    proposedCategory(approval, current),
    outcomeText(approval, current),
  ].join("\n\n");
}
function originalTerms(
  approval: LegacyAdoptionApproval,
  current: LegacyAdoptionApprovalContext | null,
  actor: string,
) {
  const reviewed = approval.receipt?.reviewed ?? current?.review;
  if (!reviewed) return "Original terms unavailable. Reload before approving.";
  return adoptionSourceText(
    {
      review: reviewed,
      category: current?.originalCategory ?? null,
      options: { members: current?.members ?? [] },
    },
    actor,
  );
}
function proposedCategory(
  approval: LegacyAdoptionApproval,
  current: LegacyAdoptionApprovalContext | null,
) {
  const id = approval.input.configuration.categoryId;
  const name =
    id === null ? "None" : (current?.category?.name ?? `Retained category reference: ${id}`);
  return `Proposed category: ${name}${current?.category?.archived ? " (archived)" : ""}.`;
}
function outcomeText(
  approval: LegacyAdoptionApproval,
  current: LegacyAdoptionApprovalContext | null,
) {
  if (approval.status === "consumed")
    return "The server confirmed adoption. No expense was recorded by this adoption.";
  if (approval.status === "denied") return "Declined. This proposal did not adopt the rule.";
  return matchesAdoptionContext(approval, current)
    ? "Approve only after reviewing the original rule and exact new mandate."
    : "Current source or category does not match. Decline and request a new review.";
}

export function legacyAdoptionApprovalActions(view: LegacyAdoptionApprovalView, now: number) {
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
function canConfirm(view: LegacyAdoptionApprovalView, expired: boolean) {
  return !expired && view.approval !== null && matchesAdoptionContext(view.approval, view.context);
}
function recoveryActions(view: LegacyAdoptionApprovalView, ready: boolean) {
  return {
    retry: ready && view.attempt !== null,
    withdraw: ready && view.attempt?.approved === true,
  };
}
function isPending(approval: LegacyAdoptionApproval | null) {
  return approval?.status === "pending" || approval?.status === "approved";
}
function approvalReady(view: LegacyAdoptionApprovalView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}
