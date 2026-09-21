import * as Schema from "effect/Schema";
import { RecurringResumeInput, canonicalRecurringResume } from "@nest/contracts/recurring-resume";
import { RecurringResumeApprovalEnvelope } from "@nest/contracts/recurring-resume-approval";
const equivalent = Schema.toEquivalence(RecurringResumeInput);
export function matchesRecurringResumeProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (
    !Schema.is(RecurringResumeInput)(input) ||
    !Schema.is(RecurringResumeApprovalEnvelope)(receipt)
  )
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    equivalent(receipt.approval.change, canonicalRecurringResume(input))
  );
}
