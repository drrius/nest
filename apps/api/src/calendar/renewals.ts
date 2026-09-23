import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CalendarRenewalQuery,
  CalendarRenewals,
} from "../../../../packages/contracts/src/calendar-renewals.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import { requestJson } from "../supabase-request.ts";
import { ApiFailure } from "../errors.ts";
import { decode } from "./codec.ts";
export function readCalendarRenewals(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* decode(CalendarRenewalQuery, input, "invalid_request");
    const after = query.after?.toLowerCase() ?? null;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_calendar_renewals", {
      p_household: caller.member.householdId,
      p_date: query.date,
      p_after: after,
    });
    const result = yield* Schema.decodeUnknownEffect(CalendarRenewals, {
      onExcessProperty: "error",
    })(raw).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      result.date !== query.date ||
      result.after !== after
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
export function calendarRenewalQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.size !== (params.has("after") ? 2 : 1) || !params.has("date"))
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return decode(
    CalendarRenewalQuery,
    { date: params.get("date"), after: params.get("after") },
    "invalid_request",
  );
}
