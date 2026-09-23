import { ReminderOperationQuery } from "@nest/contracts/reminders";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveMealReminder,
  MealReminderReceipt,
  MealReminderContext,
  MealReminderRecovery,
  MealReminderQuery,
  canonicalMealReminder,
  sameMealReminderCommand,
} from "@nest/contracts/meal-reminders";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { requestJson } from "../supabase-request.ts";
import { ApiFailure } from "../errors.ts";
const decode = <T>(
  schema: Schema.Codec<T>,
  input: unknown,
  code: "invalid_request" | "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export function mealReminderService(config: IdentityConfig, caller: AuthorizedCaller) {
  const rpc = <T extends { householdId: string }>(
    schema: Schema.Codec<T>,
    name: string,
    payload: object,
  ) =>
    Effect.gen(function* () {
      const raw = yield* requestJson(config, caller.token, `rest/v1/rpc/${name}`, {
        p_household: caller.member.householdId,
        ...payload,
      });
      const result = yield* decode(schema, raw, "unavailable");
      if (
        result.householdId !== caller.member.householdId ||
        ("actorId" in result && result.actorId !== caller.member.userId)
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  const change = (input: unknown) =>
    Effect.gen(function* () {
      const command = canonicalMealReminder(
        yield* decode(SaveMealReminder, input, "invalid_request"),
      );
      const { operationId, ...p_input } = command;
      const result = yield* rpc(MealReminderReceipt, "nest_save_meal_reminder", {
        p_operation: operationId,
        p_input,
      });
      if (!sameMealReminderCommand(result.command, command))
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  return {
    save: (input: unknown) => change(input),
    read: (input: unknown) =>
      Effect.gen(function* () {
        const query = yield* decode(MealReminderQuery, input, "invalid_request"),
          id = query.entryId.toLowerCase();
        const result = yield* rpc(MealReminderContext, "nest_read_meal_reminder", {
          p_entry: id,
        });
        if (result.meal.entryId !== id) return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
    recover: (input: unknown, cancel: boolean) =>
      Effect.gen(function* () {
        const query = yield* decode(ReminderOperationQuery, input, "invalid_request"),
          operationId = query.operationId.toLowerCase();
        const result = yield* rpc(
          MealReminderRecovery,
          cancel ? "nest_cancel_meal_reminder_operation" : "nest_read_meal_reminder_operation",
          { p_operation: operationId },
        );
        if (result.operationId !== operationId)
          return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
  };
}
