import * as Schema from "effect/Schema";
import { RecurringProposalInput } from "@nest/contracts/recurring-proposal";
import { RecurringInput, canonicalRecurring } from "@nest/contracts/recurring";
import { RecurringApprovalEnvelope } from "@nest/contracts/recurring-approval";
const equivalent = Schema.toEquivalence(RecurringInput);
export function matchesRecurringProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(RecurringProposalInput)(input) || !Schema.is(RecurringApprovalEnvelope)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    equivalent(
      receipt.approval.rule,
      canonicalRecurring({ ...input, ruleId: input.ruleId ?? receipt.approval.rule.ruleId }),
    )
  );
}
