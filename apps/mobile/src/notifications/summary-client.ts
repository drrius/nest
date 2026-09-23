import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  DailySummaryQuery,
  DailySummarySnapshot,
  LatestDailySummary,
} from "@nest/contracts/daily-summary";
import { PreferenceFailure, type preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
export function summaryReads(request: ReturnType<typeof preferenceRequests>, account: Account) {
  return (input: typeof DailySummaryQuery.Type) =>
    Schema.decodeUnknownEffect(DailySummaryQuery, { onExcessProperty: "error" })(input).pipe(
      Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
      Effect.flatMap(({ summaryId }) =>
        request(
          `v1/daily-summary?${new URLSearchParams({ summaryId: summaryId.toLowerCase() })}`,
          DailySummarySnapshot,
        ),
      ),
      Effect.flatMap((result) =>
        result.summaryId === input.summaryId.toLowerCase() &&
        result.summary.householdId === account.household &&
        result.summary.recipientId === account.actor
          ? Effect.succeed(result)
          : Effect.fail(new PreferenceFailure({ code: "unavailable" })),
      ),
    );
}

export function latestSummaryRead(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return () =>
    request("v1/latest-daily-summary", LatestDailySummary).pipe(
      Effect.flatMap((result) =>
        result.householdId === account.household && result.recipientId === account.actor
          ? Effect.succeed(result)
          : Effect.fail(new PreferenceFailure({ code: "unavailable" })),
      ),
    );
}
