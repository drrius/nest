import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReadMealWeek, MealWeekSnapshot } from "@nest/contracts/meals";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";

export function mealClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    read: (weekStart: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(ReadMealWeek)({ weekStart }).pipe(
          Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
        );
        const result = yield* request(
          `v1/meals/week?weekStart=${encodeURIComponent(query.weekStart)}`,
          MealWeekSnapshot,
        );
        if (result.householdId !== account.household || result.weekStart !== query.weekStart)
          return yield* new PreferenceFailure({ code: "forbidden" });
        return result;
      }),
  };
}
export type MealClient = ReturnType<typeof mealClient>;
