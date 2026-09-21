import type { ExpenseApproval } from "./approval-client.ts";
import type { ExpenseApprovalView } from "./approval-runtime.ts";
import { groceryExpenseSummary } from "./grocery-expense-display.ts";
import { formatChf } from "./format.ts";
export const memberLabel = (memberId: string, actor: string) =>
  memberId === actor ? "You" : "Your partner";
export function expenseConfirmation(approval: ExpenseApproval, actor: string) {
  const expense = approval.expense;
  const shares = expense.allocations
    .map((share) => `${memberLabel(share.memberId, actor)}: ${formatChf(share.centimes)}`)
    .join("\n");
  return `${expense.description}\n${groceryExpenseSummary(expense)}${formatChf(expense.amountCentimes)} · ${expense.date}\nPaid by ${expense.payerId === actor ? "you" : "your partner"}\n${shares}\n${expense.receiptPath ? "Receipt attached.\n" : ""}\nConfirming records this expense in your shared financial history. It does not transfer money.`;
}
const isPending = (approval: ExpenseApproval | null) =>
  approval?.status === "pending" || approval?.status === "approved";
const unexpired = (approval: ExpenseApproval | null, now: number) =>
  approval !== null && Date.parse(approval.expiresAt) > now;
function loaded(view: ExpenseApprovalView) {
  return view.active && view.fresh && !view.busy && !view.verify && view.approval !== null;
}
function categoryAvailable(view: ExpenseApprovalView) {
  return (
    view.approval?.expense.categoryId === null ||
    (view.category !== null && !view.category.archived)
  );
}
function canRetry(view: ExpenseApprovalView) {
  return loaded(view) && isPending(view.approval) && view.attempt !== null;
}
export function approvalActions(view: ExpenseApprovalView, now: number) {
  const pending = isPending(view.approval),
    valid = unexpired(view.approval, now);
  const decision = loaded(view) && pending && !view.attempt && valid;
  return {
    confirm: decision && categoryAvailable(view),
    deny: decision,
    retry: canRetry(view),
    expired: pending && !valid,
  };
}
