import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MealWeekSnapshot, ReadMealWeek } from "@nest/contracts/meals";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function readMealWeek(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(ReadMealWeek)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_meal_week_snapshot", {
      p_household: caller.member.householdId,
      p_week_start: query.weekStart,
    });
    const result = yield* Schema.decodeUnknownEffect(MealWeekSnapshot)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (result.householdId !== caller.member.householdId || result.weekStart !== query.weekStart)
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
export function mealWeekRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  const params = new URL(request.url).searchParams;
  if (params.size !== 1 || !params.has("weekStart"))
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return readMealWeek(config, caller, { weekStart: params.get("weekStart") });
}
