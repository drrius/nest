import type { LegacyConfirmationApprovalContext as LegacyConfirmationContext } from "./legacy-confirmation-approval-operations.ts";
import type { LegacyConfirmationApproval } from "./legacy-confirmation-approval-client.ts";
import type { LegacyConfirmationApprovalView } from "./legacy-confirmation-approval-runtime.ts";
import { legacyDraftText } from "./legacy-dismissal-confirmation.ts";
import { savedLegacyExpenseText } from "./legacy-confirmation-summary.ts";
import * as Schema from "effect/Schema";
import { LegacyConfirmInput } from "@nest/contracts/legacy-draft-confirmation";
const sameInput = Schema.toEquivalence(LegacyConfirmInput);
export function matchesConfirmationContext(
  approval: LegacyConfirmationApproval,
  current: LegacyConfirmationContext | null,
) {
  if (!current || current.approvalId !== approval.id || !sameInput(approval.input, current.input))
    return false;
  if (!validCategory(approval, current)) return false;
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
export function legacyConfirmationApprovalText(
  approval: LegacyConfirmationApproval,
  current: LegacyConfirmationContext | null,
  actor: string,
) {
  const expense = savedLegacyExpenseText(
    approval.input.expense,
    actor,
    categoryLabel(approval, current),
  );
  if (approval.receipt)
    return [
      legacyDraftText(approval.receipt.reviewed, actor),
      expense,
      "The server confirmed this expense.",
    ].join("\n\n");
  if (matchesConfirmationContext(approval, current))
    return [
      "Original retained draft",
      legacyDraftText(current!.review, actor),
      "Expense proposed for confirmation",
      expense,
      "Confirming appends one expense to shared Money. It does not transfer money or authorize future automatic expenses.",
    ].join("\n\n");
  return [
    `Draft reference: ${approval.input.draftId}\nRule reference: ${approval.input.ruleId}`,
    expense,
    approval.status === "denied"
      ? "Declined. No expense was recorded by this proposal."
      : "The current draft does not match this proposal. Decline it and request a new review.",
  ].join("\n\n");
}
export function legacyConfirmationApprovalActions(
  view: LegacyConfirmationApprovalView,
  now: number,
) {
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
function canConfirm(view: LegacyConfirmationApprovalView, expired: boolean) {
  return (
    !expired && view.approval !== null && matchesConfirmationContext(view.approval, view.context)
  );
}
function recoveryActions(view: LegacyConfirmationApprovalView, ready: boolean) {
  return {
    retry: ready && view.attempt !== null,
    withdraw: ready && view.attempt?.approved === true,
  };
}
function isPending(approval: LegacyConfirmationApproval | null) {
  return approval?.status === "pending" || approval?.status === "approved";
}
function approvalReady(view: LegacyConfirmationApprovalView) {
  return view.active && view.online && view.fresh && !view.busy && !view.verify;
}

function validCategory(approval: LegacyConfirmationApproval, current: LegacyConfirmationContext) {
  const id = approval.input.expense.categoryId;
  return id === null || (current.category?.categoryId === id && !current.category.archived);
}

function categoryLabel(
  approval: LegacyConfirmationApproval,
  current: LegacyConfirmationContext | null,
) {
  if (approval.receipt) return undefined;
  if (approval.input.expense.categoryId === null) return "None";
  const name = current?.category?.name ?? "Unavailable; reload to review";
  return `${name}${current?.category?.archived ? " (archived)" : ""}`;
}
