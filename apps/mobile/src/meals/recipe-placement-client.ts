import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PlaceRecipe, RecipePlacementReceipt } from "@nest/contracts/recipe-selection";
import { PreferenceFailure, type preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
import { matchesSelection } from "./selection-receipt.ts";
const Envelope = Schema.Struct({ version: Schema.Literal(1), receipt: RecipePlacementReceipt });
export function recipePlacementClient(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return (input: PlaceRecipe) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(PlaceRecipe)(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
      const { receipt } = yield* request("v1/meals/recipe/place", Envelope, command);
      if (!matchesSelection(command, receipt, account, 1))
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
}
