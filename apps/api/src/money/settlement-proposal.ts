import * as Schema from "effect/Schema";
import { SettlementInput } from "@nest/contracts/settlement";
import { SettlementApprovalEnvelope } from "@nest/contracts/settlement-approval";
import { canonicalSettlement } from "@nest/contracts/settlement";
const equivalent = Schema.toEquivalence(SettlementInput);
export function matchesSettlementProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  return (
    Schema.is(SettlementInput)(input) &&
    Schema.is(SettlementApprovalEnvelope)(receipt) &&
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    equivalent(receipt.approval.settlement, canonicalSettlement(input))
  );
}
