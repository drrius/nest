import * as Schema from "effect/Schema";
import {
  GenerateMealProposal,
  ReadMealProposal,
  DiscardMealProposal,
} from "@nest/contracts/meal-proposals";
export const MealProposalAttempt = Schema.Struct({
  generation: GenerateMealProposal,
  proposalId: Schema.NullOr(ReadMealProposal.fields.proposalId),
  discard: Schema.NullOr(DiscardMealProposal),
}).check(
  Schema.makeFilter((value) => !value.discard || value.discard.proposalId === value.proposalId),
);
export type MealProposalAttempt = typeof MealProposalAttempt.Type;
