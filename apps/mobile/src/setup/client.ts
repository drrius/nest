import * as Effect from "effect/Effect";
import { SetupStatus } from "@nest/contracts/setup";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export function setupClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    read: () =>
      request("v1/setup/status", SetupStatus).pipe(
        Effect.flatMap((value) =>
          value.actorId === account.actor && value.householdId === account.household
            ? Effect.succeed(value)
            : Effect.fail(new PreferenceFailure({ code: "unavailable" })),
        ),
      ),
  };
}
export type SetupClient = ReturnType<typeof setupClient>;
