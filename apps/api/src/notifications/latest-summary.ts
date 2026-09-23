import * as Effect from "effect/Effect";
import { LatestDailySummary } from "@nest/contracts/daily-summary";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import { requestJson } from "../supabase-request.ts";
import { ApiFailure } from "../errors.ts";
import { decode } from "../calendar/codec.ts";
export function readLatestDailySummary(config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const raw = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_read_latest_daily_summary",
      {
        p_household: caller.member.householdId,
      },
    );
    const result = yield* decode(LatestDailySummary, raw);
    if (
      result.householdId !== caller.member.householdId ||
      result.recipientId !== caller.member.userId
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
export function latestDailySummaryRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  if (new URL(request.url).searchParams.size !== 0)
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return readLatestDailySummary(config, caller);
}
