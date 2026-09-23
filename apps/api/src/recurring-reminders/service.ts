import { ReminderOperationQuery } from "@nest/contracts/reminders";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveRecurringReminder,
  RecurringReminderReceipt,
  RecurringReminderContext,
  RecurringReminderRecovery,
  RecurringReminderQuery,
  canonicalRecurringReminder,
  sameRecurringReminderCommand,
} from "@nest/contracts/recurring-reminders";
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
export function recurringReminderService(config: IdentityConfig, caller: AuthorizedCaller) {
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
      const command = canonicalRecurringReminder(
        yield* decode(SaveRecurringReminder, input, "invalid_request"),
      );
      const { operationId, ...p_input } = command;
      const result = yield* rpc(RecurringReminderReceipt, "nest_save_recurring_reminder", {
        p_operation: operationId,
        p_input,
      });
      if (!sameRecurringReminderCommand(result.command, command))
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  return {
    save: (input: unknown) => change(input),
    read: (input: unknown) =>
      Effect.gen(function* () {
        const query = yield* decode(RecurringReminderQuery, input, "invalid_request"),
          id = query.ruleId.toLowerCase();
        const result = yield* rpc(RecurringReminderContext, "nest_read_recurring_reminder", {
          p_item: id,
        });
        if (result.rule.ruleId !== id) return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
    recover: (input: unknown, cancel: boolean) =>
      Effect.gen(function* () {
        const query = yield* decode(ReminderOperationQuery, input, "invalid_request"),
          operationId = query.operationId.toLowerCase();
        const result = yield* rpc(
          RecurringReminderRecovery,
          cancel
            ? "nest_cancel_recurring_reminder_operation"
            : "nest_read_recurring_reminder_operation",
          { p_operation: operationId },
        );
        if (result.operationId !== operationId)
          return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
  };
}
