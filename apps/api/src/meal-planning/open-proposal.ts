import * as Effect from "effect/Effect";
import { MealProposalGenerationResult, ReadMealProposal } from "@nest/contracts/meal-proposals";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import { requestJson } from "../supabase-request.ts";
import { bindEnvelope, decodeProposal } from "./proposal-state.ts";
export function openProposal(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* decodeProposal(ReadMealProposal, input, "invalid_request");
    const proposalId = command.proposalId.toLowerCase();
    const read = (rpc: "nest_read_meal_proposal_origin" | "nest_open_meal_proposal") =>
      Effect.gen(function* () {
        const result = yield* decodeProposal(
          MealProposalGenerationResult,
          yield* requestJson(config, caller.token, `rest/v1/rpc/${rpc}`, {
            p_household: caller.member.householdId,
            p_proposal: proposalId,
          }),
        );
        yield* bindEnvelope(caller, proposalId, result.envelope);
        return result;
      });
    const saved = yield* read("nest_read_meal_proposal_origin");
    return saved.envelope.proposal.status === "generating"
      ? yield* read("nest_open_meal_proposal")
      : saved;
  });
}
