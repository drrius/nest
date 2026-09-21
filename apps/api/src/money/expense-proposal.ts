import * as Schema from "effect/Schema";
import { ExpenseInput } from "@nest/contracts/expense";
import { ExpenseApprovalEnvelope } from "@nest/contracts/expense-approval";
import { canonicalExpense } from "./expense-input.ts";
const equivalent = Schema.toEquivalence(ExpenseInput);
export function matchesExpenseProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  return (
    Schema.is(ExpenseInput)(input) &&
    Schema.is(ExpenseApprovalEnvelope)(receipt) &&
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    equivalent(receipt.approval.expense, canonicalExpense(input))
  );
}
