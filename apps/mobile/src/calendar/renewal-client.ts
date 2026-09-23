import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CalendarRenewalQuery,
  CalendarRenewals,
} from "../../../../packages/contracts/src/calendar-renewals.ts";
import { PreferenceFailure, type preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
export function calendarRenewalReads(
  request: ReturnType<typeof preferenceRequests>,
  account: Account,
) {
  return {
    renewals: (input: typeof CalendarRenewalQuery.Type) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(CalendarRenewalQuery, {
          onExcessProperty: "error",
        })(input).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const after = query.after?.toLowerCase() ?? null;
        const params = new URLSearchParams({ date: query.date });
        if (after) params.set("after", after);
        const result = yield* request(`v1/calendar/renewals?${params}`, CalendarRenewals);
        if (
          result.householdId !== account.household ||
          result.date !== query.date ||
          result.after !== after
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
