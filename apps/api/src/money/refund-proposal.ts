import * as Schema from "effect/Schema";
import { RefundInput } from "@nest/contracts/refund";
import { RefundApprovalEnvelope } from "@nest/contracts/refund-approval";
import { canonicalRefund } from "@nest/contracts/refund";
const equivalent = Schema.toEquivalence(RefundInput);
export function matchesRefundProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  return (
    Schema.is(RefundInput)(input) &&
    Schema.is(RefundApprovalEnvelope)(receipt) &&
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    equivalent(receipt.approval.refund, canonicalRefund(input))
  );
}
