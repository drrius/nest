import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyRecurringList, LegacyRecurringQuery } from "@nest/contracts/legacy-recurring";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export function legacyRecurringClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    legacyRecurring: (after: string | null = null) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(LegacyRecurringQuery)({ after }).pipe(
          Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
        );
        const cursor = query.after?.toLowerCase() ?? null,
          params = new URLSearchParams();
        if (cursor !== null) params.set("after", cursor);
        const result = yield* request(`v1/money/recurring/legacy?${params}`, LegacyRecurringList);
        if (result.householdId !== account.household || result.after !== cursor)
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
