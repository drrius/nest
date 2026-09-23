import * as Effect from "effect/Effect";
import { DailySummaryQuery, DailySummarySnapshot } from "@nest/contracts/daily-summary";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import { requestJson } from "../supabase-request.ts";
import { ApiFailure } from "../errors.ts";
import { decode } from "../calendar/codec.ts";
export function readDailySummary(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* decode(DailySummaryQuery, input, "invalid_request");
    const summaryId = query.summaryId.toLowerCase();
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_read_daily_summary", {
      p_household: caller.member.householdId,
      p_summary: summaryId,
    });
    const result = yield* decode(DailySummarySnapshot, raw);
    if (
      result.summaryId !== summaryId ||
      result.summary.householdId !== caller.member.householdId ||
      result.summary.recipientId !== caller.member.userId
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
export function dailySummaryRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  const params = new URL(request.url).searchParams;
  if (params.size !== 1 || !params.has("summaryId"))
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return readDailySummary(config, caller, { summaryId: params.get("summaryId") });
}
