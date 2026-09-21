import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ArchiveRecipe, RecipeArchiveReceipt } from "@nest/contracts/recipe-archive";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function archiveRecipe(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(ArchiveRecipe)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_archive_recipe", {
      p_household: caller.member.householdId,
      p_operation: command.operationId.toLowerCase(),
      p_input: {
        definitionId: command.definitionId.toLowerCase(),
        expectedRevision: command.expectedRevision,
      },
    });
    const receipt = yield* Schema.decodeUnknownEffect(RecipeArchiveReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      receipt.actorId !== caller.member.userId ||
      receipt.householdId !== caller.member.householdId ||
      receipt.operationId !== command.operationId.toLowerCase() ||
      receipt.definitionId !== command.definitionId.toLowerCase() ||
      BigInt(receipt.revision) !== BigInt(command.expectedRevision) + 1n
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}
