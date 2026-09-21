import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ReplaceWithRecipe, RecipeReplacementReceipt } from "@nest/contracts/recipe-selection";
import { matchesSelection } from "./selection-receipt.ts";
export function replaceWithRecipe(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(ReplaceWithRecipe)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const { operationId, ...payload } = command;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_replace_with_recipe", {
      p_household: caller.member.householdId,
      p_operation: operationId.toLowerCase(),
      p_input: {
        ...payload,
        definitionId: command.definitionId.toLowerCase(),
        entryId: command.entryId.toLowerCase(),
      },
    });
    const receipt = yield* Schema.decodeUnknownEffect(RecipeReplacementReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      !matchesSelection(command, receipt, caller.member, 2) ||
      receipt.previousEntryId !== command.entryId.toLowerCase()
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}
