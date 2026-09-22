import * as Schema from "effect/Schema";
import { LegacyRecurringDraft } from "./legacy-recurring-drafts.ts";
import { RecurringInput } from "./recurring.ts";
const Uuid = RecurringInput.fields.ruleId;
const ReviewToken = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/));
export const LegacyDraftContextQuery = Schema.Struct({ draftId: Uuid });
export const LegacyDraftContext = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  draft: LegacyRecurringDraft,
  reviewToken: ReviewToken,
});
export const LegacyDismissInput = Schema.Struct({
  draftId: Uuid,
  ruleId: Uuid,
  reviewToken: ReviewToken,
});
export type LegacyDismissInput = typeof LegacyDismissInput.Type;
export const SaveLegacyDismissal = Schema.Struct({ operationId: Uuid, input: LegacyDismissInput });
export const ExecuteLegacyDismissal = Schema.Struct({
  ...SaveLegacyDismissal.fields,
  approvalId: Uuid,
});
export const LegacyDismissalReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  input: LegacyDismissInput,
  reviewed: LegacyDraftContext,
  status: Schema.Literal("dismissed"),
}).check(
  Schema.makeFilter(
    (result) =>
      result.reviewed.householdId === result.householdId &&
      result.reviewed.reviewToken === result.input.reviewToken &&
      result.reviewed.draft.draftId === result.input.draftId &&
      result.reviewed.draft.ruleId === result.input.ruleId &&
      result.reviewed.draft.status === "pending" &&
      result.reviewed.draft.sourceKind === "recurring" &&
      result.reviewed.draft.eventId === null,
  ),
);
export const LegacyDismissalRecoveryQuery = Schema.Struct({ operationId: Uuid });
export const LegacyDismissalRecovery = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "cancelled", "recorded"]),
  receipt: Schema.NullOr(LegacyDismissalReceipt),
}).check(
  Schema.makeFilter((result) => {
    const receipt = result.receipt;
    return receipt === null
      ? result.status !== "recorded"
      : result.status === "recorded" &&
          receipt.actorId === result.actorId &&
          receipt.householdId === result.householdId &&
          receipt.operationId === result.operationId &&
          receipt.approvalId === null;
  }),
);
export function canonicalLegacyDismissal(input: LegacyDismissInput): LegacyDismissInput {
  return { ...input, draftId: input.draftId.toLowerCase(), ruleId: input.ruleId.toLowerCase() };
}
