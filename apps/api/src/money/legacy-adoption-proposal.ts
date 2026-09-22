import * as Schema from "effect/Schema";
import { LegacyAdoptionProposal } from "@nest/contracts/legacy-adoption-command";
import { LegacyAdoptionApprovalEnvelope } from "@nest/contracts/legacy-adoption-approval";
import { canonicalRecurring, RecurringConfiguration } from "@nest/contracts/recurring";
const same = Schema.toEquivalence(RecurringConfiguration);
export function matchesLegacyAdoptionProposal(
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
) {
  if (
    !Schema.is(LegacyAdoptionProposal)(input) ||
    !Schema.is(LegacyAdoptionApprovalEnvelope)(receipt)
  )
    return false;
  const configuration = canonicalRecurring({
    ...input,
    expectedRevision: null,
    firstDueOn: input.configuration.startDate,
  }).configuration;
  return (
    receipt.actorId === member.userId &&
    receipt.householdId === member.householdId &&
    receipt.approval.status === "pending" &&
    receipt.approval.receipt === null &&
    receipt.approval.input.ruleId === input.ruleId.toLowerCase() &&
    same(receipt.approval.input.configuration, configuration)
  );
}
