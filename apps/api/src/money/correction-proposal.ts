import * as Schema from "effect/Schema";
import { CorrectionInput } from "@nest/contracts/correction";
import { CorrectionApprovalEnvelope } from "@nest/contracts/correction-approval";
import { canonicalCorrection } from "@nest/contracts/correction";
const equivalent = Schema.toEquivalence(CorrectionInput);
export function matchesCorrectionProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  return (
    Schema.is(CorrectionInput)(input) &&
    Schema.is(CorrectionApprovalEnvelope)(receipt) &&
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    equivalent(receipt.approval.correction, canonicalCorrection(input))
  );
}
