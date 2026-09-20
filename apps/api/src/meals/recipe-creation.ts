import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CreateRecipe, RecipeCreationReceipt } from "@nest/contracts/recipe-creation";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function createRecipe(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(CreateRecipe)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const { operationId, recipe, expectedRevision } = command;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_create_recipe", {
      p_household: caller.member.householdId,
      p_operation: operationId.toLowerCase(),
      p_input: {
        expectedRevision,
        recipe: {
          ...recipe,
          ingredients: recipe.ingredients.map((ingredient) => ({
            ...ingredient,
            categoryId: ingredient.categoryId?.toLowerCase() ?? null,
          })),
        },
      },
    });
    const receipt = yield* Schema.decodeUnknownEffect(RecipeCreationReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      receipt.actorId !== caller.member.userId ||
      receipt.householdId !== caller.member.householdId ||
      receipt.operationId !== operationId.toLowerCase() ||
      BigInt(receipt.revision) !== BigInt(expectedRevision) + BigInt(recipe.ingredients.length) + 1n
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}
