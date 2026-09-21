import * as Effect from "effect/Effect";
import { MealProposalGenerationResult, ReadMealProposal } from "@nest/contracts/meal-proposals";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import { requestJson } from "../supabase-request.ts";
import { bindEnvelope, decodeProposal } from "./proposal-state.ts";
export function openProposal(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* decodeProposal(ReadMealProposal, input, "invalid_request");
    const result = yield* decodeProposal(
      MealProposalGenerationResult,
      yield* requestJson(config, caller.token, "rest/v1/rpc/nest_open_meal_proposal", {
        p_household: caller.member.householdId,
        p_proposal: command.proposalId.toLowerCase(),
      }),
    );
    yield* bindEnvelope(caller, command.proposalId.toLowerCase(), result.envelope);
    return result;
  });
}
