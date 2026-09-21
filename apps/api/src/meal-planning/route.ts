import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import type { AssistantModel } from "@nest/ai/chat";
import { ApiFailure } from "../errors.ts";
import { commandBody } from "../request-body.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { planningServerRpc } from "./server-rpc.ts";
import { proposalState } from "./proposal-state.ts";
import { generateProposal } from "./generate-proposal.ts";
export type MealPlanningOptions = {
  model?: AssistantModel;
  planningSecret?: Redacted.Redacted<string>;
};
export function mealProposalRoute(config: IdentityConfig, options: MealPlanningOptions) {
  const rpc = options.planningSecret
    ? planningServerRpc(config, options.planningSecret)
    : undefined;
  return (request: Request, caller: AuthorizedCaller) =>
    Effect.gen(function* () {
      const { pathname, searchParams } = new URL(request.url),
        state = proposalState(config, caller);
      if (pathname === "/v1/meals/proposal") {
        if (!validReadQuery(searchParams))
          return yield* new ApiFailure({ code: "invalid_request" });
        return yield* state.read({ proposalId: searchParams.get("proposalId") });
      }
      if (searchParams.size) return yield* new ApiFailure({ code: "invalid_request" });
      const input = yield* commandBody(request);
      if (pathname === "/v1/meals/proposal/reserve")
        return { version: 1, receipt: yield* state.begin(input) };
      if (pathname === "/v1/meals/proposal/recover") return yield* state.read(input, true);
      if (pathname === "/v1/meals/proposal/discard")
        return { version: 1, receipt: yield* state.discard(input) };
      if (pathname !== "/v1/meals/proposal/generate")
        return yield* new ApiFailure({ code: "invalid_request" });
      if (!options.model || !rpc) return yield* new ApiFailure({ code: "unavailable" });
      return yield* generateProposal(config, caller, input, { model: options.model, rpc });
    });
}

const validReadQuery = (params: URLSearchParams) => params.size === 1 && params.has("proposalId");
