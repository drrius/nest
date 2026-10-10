import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { EditRecipe, RecipeEditReceipt } from "@nest/contracts/recipe-edit";
import { PreferenceFailure, type preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: RecipeEditReceipt });
export function recipeEditClient(request: ReturnType<typeof preferenceRequests>, account: Account) {
  return (input: EditRecipe) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(EditRecipe)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/recipe/edit", Envelope, command);
      if (
        receipt.actorId !== account.actor ||
        receipt.householdId !== account.household ||
        receipt.operationId !== command.operationId.toLowerCase() ||
        receipt.definitionId !== command.definitionId.toLowerCase() ||
        receipt.previousRevision !== command.expectedRevision
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}
