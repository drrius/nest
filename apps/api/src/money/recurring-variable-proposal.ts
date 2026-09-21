import * as Schema from "effect/Schema";
import { VariableCycleInput, canonicalVariableCycle } from "@nest/contracts/recurring-variable";
import { VariableCycleApprovalEnvelope } from "@nest/contracts/recurring-variable-approval";
const equivalent = Schema.toEquivalence(VariableCycleInput);
export function matchesVariableCycleProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(VariableCycleInput)(input) || !Schema.is(VariableCycleApprovalEnvelope)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    equivalent(receipt.approval.input, canonicalVariableCycle(input))
  );
}
