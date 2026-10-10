import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CreateRecipe, RecipeCreationReceipt } from "@nest/contracts/recipe-creation";
import { PreferenceFailure, type preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: RecipeCreationReceipt });
export function recipeCreationClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: typeof CreateRecipe.Type) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(CreateRecipe)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/recipe/create", Envelope, command);
      if (
        receipt.actorId !== account.actor ||
        receipt.householdId !== account.household ||
        receipt.operationId !== command.operationId.toLowerCase() ||
        BigInt(receipt.revision) !==
          BigInt(command.expectedRevision) + BigInt(command.recipe.ingredients.length) + 1n
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}
