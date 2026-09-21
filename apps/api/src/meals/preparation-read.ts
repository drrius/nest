import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import {
  ReadMealPreparation,
  MealPreparationEnvelope,
} from "@nest/contracts/meal-preparation-read";
export function readMealPreparation(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(ReadMealPreparation)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_meal_preparation", {
      p_household: caller.member.householdId,
      p_week: query.weekStart,
      p_revision: query.revision,
      p_entry: query.entryId.toLowerCase(),
    });
    const result = yield* Schema.decodeUnknownEffect(MealPreparationEnvelope)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      result.weekStart !== query.weekStart ||
      result.revision !== query.revision ||
      result.entryId !== query.entryId.toLowerCase() ||
      (result.entry !== null && result.entry.entryId !== query.entryId.toLowerCase())
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
export function mealPreparationRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  const { searchParams } = new URL(request.url),
    keys = ["entryId", "weekStart", "revision"];
  if (
    Array.from(searchParams.keys()).some((key) => !keys.includes(key)) ||
    new Set(searchParams.keys()).size !== searchParams.size
  )
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return readMealPreparation(config, caller, {
    entryId: searchParams.get("entryId"),
    weekStart: searchParams.get("weekStart"),
    revision: searchParams.get("revision"),
  });
}
