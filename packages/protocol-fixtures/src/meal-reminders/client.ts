import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  MealReminderQuery,
  MealReminderContext,
  SaveMealReminder,
  MealReminderReceipt,
  MealReminderRecovery,
  canonicalMealReminder,
  sameMealReminderCommand,
} from "@nest/contracts/meal-reminders";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
const decode = <T>(schema: Schema.Codec<T>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
export function mealReminderClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const rawRequest = preferenceRequests(apiUrl, account, credentials);
  const request = <T extends { householdId: string }>(
    path: string,
    schema: Schema.Codec<T>,
    body?: object,
  ) =>
    rawRequest(path, schema, body).pipe(
      Effect.flatMap((result) =>
        result.householdId !== account.household ||
        ("actorId" in result && result.actorId !== account.actor)
          ? Effect.fail(unavailable())
          : Effect.succeed(result),
      ),
    );
  const command = (input: typeof SaveMealReminder.Type) =>
    decode(SaveMealReminder, input).pipe(Effect.map(canonicalMealReminder));
  const recover = (input: typeof SaveMealReminder.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const expected = yield* command(input),
        operationId = expected.operationId;
      const result = yield* request(
        cancel
          ? "v1/meal-reminders/cancel-operation"
          : `v1/meal-reminders/operation?${new URLSearchParams({ operationId })}`,
        MealReminderRecovery,
        cancel ? { operationId } : undefined,
      );
      if (
        result.operationId !== operationId ||
        (result.receipt !== null && !sameMealReminderCommand(result.receipt.command, expected))
      )
        return yield* unavailable();
      return result;
    });
  return {
    detail: (entryId: string) =>
      Effect.gen(function* () {
        const query = yield* decode(MealReminderQuery, { entryId });
        const target = query.entryId.toLowerCase();
        const result = yield* request(
          `v1/meal-reminders/detail?${new URLSearchParams({ entryId: target })}`,
          MealReminderContext,
        );
        if (result.meal.entryId !== target) return yield* unavailable();
        return result;
      }),
    save: (input: typeof SaveMealReminder.Type) =>
      Effect.gen(function* () {
        const expected = yield* command(input);
        const result = yield* request("v1/meal-reminders/save", MealReminderReceipt, expected);
        if (!sameMealReminderCommand(result.command, expected)) return yield* unavailable();
        return result;
      }),
    recover: (input: typeof SaveMealReminder.Type) => recover(input, false),
    cancel: (input: typeof SaveMealReminder.Type) => recover(input, true),
  };
}
export type MealReminderClient = ReturnType<typeof mealReminderClient>;
