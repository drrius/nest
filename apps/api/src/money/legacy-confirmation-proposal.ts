import * as Schema from "effect/Schema";
import { LegacyConfirmationProposal } from "@nest/contracts/legacy-draft-confirmation";
import { LegacyConfirmationApprovalEnvelope } from "@nest/contracts/legacy-confirmation-approval";
import { ExpenseInput } from "@nest/contracts/expense";
import { canonicalExpense } from "./expense-input.ts";
const sameExpense = Schema.toEquivalence(ExpenseInput);
export function matchesLegacyConfirmationProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (
    !Schema.is(LegacyConfirmationProposal)(input) ||
    !Schema.is(LegacyConfirmationApprovalEnvelope)(receipt)
  )
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    receipt.approval.input.draftId === input.draftId.toLowerCase() &&
    sameExpense(receipt.approval.input.expense, canonicalExpense(input.expense))
  );
}
