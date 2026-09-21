import * as Effect from "effect/Effect";
import { ApproveMealProposal, MealProposalApprovalReceipt } from "@nest/contracts/meal-proposals";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { decodeProposal } from "./proposal-state.ts";

// Called only by the explicit approval route, never by generation or an assistant tool.
export function approveProposal(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* decodeProposal(ApproveMealProposal, input, "invalid_request");
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_approve_meal_proposal", {
      p_household: caller.member.householdId,
      p_operation: command.operationId.toLowerCase(),
      p_input: {
        proposalId: command.proposalId.toLowerCase(),
        expectedRevision: command.expectedRevision,
      },
    });
    const receipt = yield* decodeProposal(MealProposalApprovalReceipt, raw);
    if (
      receipt.actorId !== caller.member.userId ||
      receipt.householdId !== caller.member.householdId ||
      receipt.operationId !== command.operationId.toLowerCase() ||
      receipt.proposalId !== command.proposalId.toLowerCase() ||
      receipt.approvedRevision !== command.expectedRevision
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}
