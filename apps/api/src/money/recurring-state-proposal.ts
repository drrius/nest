import * as Schema from "effect/Schema";
import { RecurringStateInput, canonicalRecurringState } from "@nest/contracts/recurring-state";
import { RecurringStateApprovalEnvelope } from "@nest/contracts/recurring-state-approval";
const equivalent = Schema.toEquivalence(RecurringStateInput);
export function matchesRecurringStateProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (!Schema.is(RecurringStateInput)(input) || !Schema.is(RecurringStateApprovalEnvelope)(receipt))
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    equivalent(receipt.approval.change, canonicalRecurringState(input))
  );
}
