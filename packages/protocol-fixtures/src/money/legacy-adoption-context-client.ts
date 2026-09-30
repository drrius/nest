import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyAdoptionContext, LegacyAdoptionContextQuery } from "@nest/contracts/legacy-adoption";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export function legacyAdoptionContextClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    legacyAdoptionContext: (ruleId: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(LegacyAdoptionContextQuery)({
          ruleId,
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const target = query.ruleId.toLowerCase();
        const result = yield* request(
          `v1/money/recurring/legacy-adoption/context?${new URLSearchParams({ ruleId: target })}`,
          LegacyAdoptionContext,
        );
        if (result.householdId !== account.household || result.rule.ruleId !== target)
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
