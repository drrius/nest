import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { FoodProfileEnvelope, FoodSaveEnvelope, SaveFoodPreferences } from "@nest/contracts/food";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure as FoodFailure } from "../preferences/client.ts";
export { PreferenceFailure as FoodFailure } from "../preferences/client.ts";
const unavailable = () => new FoodFailure({ code: "unavailable" });
export function foodClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    read: () =>
      request("v1/food-preferences", FoodProfileEnvelope).pipe(
        Effect.flatMap((value) =>
          value.actorId === account.actor &&
          value.householdId === account.household &&
          value.profile?.revision !== "0"
            ? Effect.succeed(value.profile)
            : Effect.fail(unavailable()),
        ),
      ),
    save: (input: SaveFoodPreferences) =>
      Schema.decodeUnknownEffect(SaveFoodPreferences, { onExcessProperty: "error" })(input).pipe(
        Effect.mapError(() => new FoodFailure({ code: "invalid" })),
        Effect.flatMap((command) => request("v1/food-preferences/save", FoodSaveEnvelope, command)),
        Effect.flatMap(({ receipt }) =>
          receipt.actorId === account.actor &&
          receipt.householdId === account.household &&
          receipt.operationId === input.operationId.toLowerCase() &&
          BigInt(receipt.revision) === BigInt(input.expectedRevision) + 1n
            ? Effect.succeed(receipt)
            : Effect.fail(unavailable()),
        ),
      ),
  };
}
export type FoodClient = ReturnType<typeof foodClient>;
