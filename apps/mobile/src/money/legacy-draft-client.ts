import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyDraftList, LegacyDraftQuery } from "@nest/contracts/legacy-recurring-drafts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export function legacyDraftClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    legacyDrafts: (input: typeof LegacyDraftQuery.Type) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(LegacyDraftQuery)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const cursor = query.after?.toLowerCase() ?? null,
          params = new URLSearchParams({ ruleId: query.ruleId.toLowerCase() });
        if (cursor !== null) params.set("after", cursor);
        const result = yield* request(
          `v1/money/recurring/legacy-drafts?${params}`,
          LegacyDraftList,
        );
        if (
          result.householdId !== account.household ||
          result.after !== cursor ||
          result.ruleId !== query.ruleId.toLowerCase()
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
