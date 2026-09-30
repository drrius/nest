import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  LegacyDraftContext,
  LegacyDraftContextQuery,
} from "@nest/contracts/legacy-draft-dismissal";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export function legacyDraftContextClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    legacyDraftContext: (draftId: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(LegacyDraftContextQuery)({ draftId }).pipe(
          Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
        );
        const target = query.draftId.toLowerCase();
        const result = yield* request(
          `v1/money/recurring/legacy-dismissal/context?${new URLSearchParams({ draftId: target })}`,
          LegacyDraftContext,
        );
        if (result.householdId !== account.household || result.draft.draftId !== target)
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
