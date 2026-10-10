import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CookingProfileEnvelope,
  CookingSaveEnvelope,
  SaveCookingPreferences,
} from "@nest/contracts/cooking";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
export function cookingClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    read: () =>
      request("v1/cooking-preferences", CookingProfileEnvelope).pipe(
        Effect.flatMap((value) =>
          value.householdId === account.household && value.profile?.revision !== "0"
            ? Effect.succeed(value.profile)
            : Effect.fail(unavailable()),
        ),
      ),
    save: (input: SaveCookingPreferences) =>
      Schema.decodeUnknownEffect(SaveCookingPreferences, { onExcessProperty: "error" })(input).pipe(
        Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
        Effect.flatMap((command) =>
          request("v1/cooking-preferences/save", CookingSaveEnvelope, command),
        ),
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
export type CookingClient = ReturnType<typeof cookingClient>;
