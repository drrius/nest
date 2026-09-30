import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RecurringHistory, RecurringHistoryQuery } from "@nest/contracts/recurring-history";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export function recurringHistoryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    recurringHistory: (input: typeof RecurringHistoryQuery.Type) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(RecurringHistoryQuery)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const ruleId = query.ruleId.toLowerCase(),
          params = new URLSearchParams({ ruleId });
        if (query.before !== null) params.set("before", query.before);
        const result = yield* request(`v1/money/recurring/cycles?${params}`, RecurringHistory);
        if (
          result.householdId !== account.household ||
          result.ruleId !== ruleId ||
          result.before !== query.before
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
