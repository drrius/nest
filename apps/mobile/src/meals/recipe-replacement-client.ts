import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReplaceWithRecipe, RecipeReplacementReceipt } from "@nest/contracts/recipe-selection";
import { PreferenceFailure, type preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
import { matchesSelection } from "./selection-receipt.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: RecipeReplacementReceipt });
export function recipeReplacementClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: ReplaceWithRecipe) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(ReplaceWithRecipe)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/recipe/replace", Envelope, command);
      if (
        !matchesSelection(command, receipt, account, 2) ||
        receipt.previousEntryId !== command.entryId.toLowerCase()
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}
