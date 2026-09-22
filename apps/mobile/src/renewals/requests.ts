import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export const invalidRenewal = () => new PreferenceFailure({ code: "invalid" });
export const unavailableRenewal = () => new PreferenceFailure({ code: "unavailable" });
export const validateRenewal = <T>(schema: Schema.Codec<T>, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(invalidRenewal),
  );
export function renewalRequests(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return <T extends { householdId: string }>(
    path: string,
    schema: Schema.Codec<T>,
    input?: object,
  ) =>
    request(path, schema, input).pipe(
      Effect.flatMap((result) =>
        result.householdId === account.household &&
        (!("actorId" in result) || result.actorId === account.actor)
          ? Effect.succeed(result)
          : Effect.fail(unavailableRenewal()),
      ),
    );
}
export type RenewalRequests = ReturnType<typeof renewalRequests>;
