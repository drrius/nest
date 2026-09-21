import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  EditRecipe,
  RecipeEditReceipt,
  RecipeIngredientSelection,
} from "@nest/contracts/recipe-edit";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
function canonicalIngredient(item: typeof RecipeIngredientSelection.Type) {
  if (item.kind === "new") return { ...item, categoryId: item.categoryId?.toLowerCase() ?? null };
  const patch =
    item.patch.categoryId === undefined
      ? item.patch
      : {
          ...item.patch,
          categoryId: item.patch.categoryId?.toLowerCase() ?? null,
        };
  return { ...item, ingredientId: item.ingredientId.toLowerCase(), patch };
}
export function editRecipe(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* Schema.decodeUnknownEffect(EditRecipe)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_edit_recipe", {
      p_household: caller.member.householdId,
      p_operation: command.operationId.toLowerCase(),
      p_input: {
        definitionId: command.definitionId.toLowerCase(),
        expectedRevision: command.expectedRevision,
        patch: command.patch,
        ingredients: command.ingredients?.map(canonicalIngredient) ?? null,
      },
    });
    const receipt = yield* Schema.decodeUnknownEffect(RecipeEditReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      receipt.actorId !== caller.member.userId ||
      receipt.householdId !== caller.member.householdId ||
      receipt.operationId !== command.operationId.toLowerCase() ||
      receipt.definitionId !== command.definitionId.toLowerCase() ||
      receipt.previousRevision !== command.expectedRevision
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}
