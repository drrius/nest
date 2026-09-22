import * as Schema from "effect/Schema";
import { ManualCycleInput, canonicalManualCycle } from "@nest/contracts/recurring-manual";
import { ManualCycleApprovalEnvelope } from "@nest/contracts/recurring-manual-approval";
const equivalent = Schema.toEquivalence(ManualCycleInput);
export function matchesManualCycleProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(ManualCycleInput)(input) || !Schema.is(ManualCycleApprovalEnvelope)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    equivalent(receipt.approval.input, canonicalManualCycle(input))
  );
}
