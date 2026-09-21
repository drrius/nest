import * as Schema from "effect/Schema";
import {
  GenerateMealProposal,
  ReadMealProposal,
  DiscardMealProposal,
  ApproveMealProposal,
} from "@nest/contracts/meal-proposals";
export const MealProposalAttempt = Schema.Struct({
  generation: GenerateMealProposal,
  proposalId: Schema.NullOr(ReadMealProposal.fields.proposalId),
  discard: Schema.NullOr(DiscardMealProposal),
  // Optional for metadata written by earlier app versions; missing means no approval intent.
  approval: Schema.optionalKey(ApproveMealProposal),
}).check(
  Schema.makeFilter((value) => !value.discard || value.discard.proposalId === value.proposalId),
  Schema.makeFilter(
    (value) =>
      !value.approval || (!value.discard && value.approval.proposalId === value.proposalId),
  ),
);
export type MealProposalAttempt = typeof MealProposalAttempt.Type;
