import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ArchiveRecipe, RecipeArchiveReceipt } from "@nest/contracts/recipe-archive";
import { PreferenceFailure, type preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: RecipeArchiveReceipt });
export function recipeArchiveClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: typeof ArchiveRecipe.Type) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(ArchiveRecipe)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/recipe/archive", Envelope, command);
      if (
        receipt.actorId !== account.actor ||
        receipt.householdId !== account.household ||
        receipt.operationId !== command.operationId.toLowerCase() ||
        receipt.definitionId !== command.definitionId.toLowerCase() ||
        BigInt(receipt.revision) !== BigInt(command.expectedRevision) + 1n
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}
