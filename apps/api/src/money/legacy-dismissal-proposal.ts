import * as Schema from "effect/Schema";
import { LegacyDraftContextQuery } from "@nest/contracts/legacy-draft-dismissal";
import { LegacyDismissalApprovalEnvelope } from "@nest/contracts/legacy-dismissal-approval";
export function matchesLegacyDismissalProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (
    !Schema.is(LegacyDraftContextQuery)(input) ||
    !Schema.is(LegacyDismissalApprovalEnvelope)(receipt)
  )
    return false;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    receipt.approval.input.draftId === input.draftId.toLowerCase()
  );
}
