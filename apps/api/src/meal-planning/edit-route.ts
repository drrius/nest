import * as Effect from "effect/Effect";
import { ApiFailure } from "../errors.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { MealPlanningOptions } from "./route.ts";
import type { planningServerRpc } from "./server-rpc.ts";
import { proposalEditState } from "./edit-state.ts";
import { editProposal } from "./edit-proposal.ts";
export function proposalEditRoute(
  config: IdentityConfig,
  options: MealPlanningOptions,
  rpc: ReturnType<typeof planningServerRpc> | undefined,
) {
  return (pathname: string, caller: AuthorizedCaller, input: unknown) =>
    Effect.gen(function* () {
      const state = proposalEditState(config, caller);
      if (pathname === "/v1/meals/proposal/edit/reserve") return yield* state.begin(input);
      if (pathname === "/v1/meals/proposal/edit/recover") return yield* state.read(input);
      if (pathname !== "/v1/meals/proposal/edit")
        return yield* new ApiFailure({ code: "invalid_request" });
      if (!options.model || !rpc) return yield* new ApiFailure({ code: "unavailable" });
      return yield* editProposal(config, caller, input, { rpc, model: options.model });
    });
}
