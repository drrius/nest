import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  RecurringReminderQuery,
  RecurringReminderContext,
  SaveRecurringReminder,
  RecurringReminderReceipt,
  RecurringReminderRecovery,
  canonicalRecurringReminder,
  sameRecurringReminderCommand,
} from "@nest/contracts/recurring-reminders";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
const decode = <T>(schema: Schema.Codec<T>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
export function recurringReminderClient(
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
  const command = (input: typeof SaveRecurringReminder.Type) =>
    decode(SaveRecurringReminder, input).pipe(Effect.map(canonicalRecurringReminder));
  const recover = (input: typeof SaveRecurringReminder.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const expected = yield* command(input),
        operationId = expected.operationId;
      const result = yield* request(
        cancel
          ? "v1/recurring-reminders/cancel-operation"
          : `v1/recurring-reminders/operation?${new URLSearchParams({ operationId })}`,
        RecurringReminderRecovery,
        cancel ? { operationId } : undefined,
      );
      if (
        result.operationId !== operationId ||
        (result.receipt !== null && !sameRecurringReminderCommand(result.receipt.command, expected))
      )
        return yield* unavailable();
      return result;
    });
  return {
    detail: (ruleId: string) =>
      Effect.gen(function* () {
        const query = yield* decode(RecurringReminderQuery, { ruleId });
        const target = query.ruleId.toLowerCase();
        const result = yield* request(
          `v1/recurring-reminders/detail?${new URLSearchParams({ ruleId: target })}`,
          RecurringReminderContext,
        );
        if (result.rule.ruleId !== target) return yield* unavailable();
        return result;
      }),
    save: (input: typeof SaveRecurringReminder.Type) =>
      Effect.gen(function* () {
        const expected = yield* command(input);
        const result = yield* request(
          "v1/recurring-reminders/save",
          RecurringReminderReceipt,
          expected,
        );
        if (!sameRecurringReminderCommand(result.command, expected)) return yield* unavailable();
        return result;
      }),
    recover: (input: typeof SaveRecurringReminder.Type) => recover(input, false),
    cancel: (input: typeof SaveRecurringReminder.Type) => recover(input, true),
  };
}
export type RecurringReminderClient = ReturnType<typeof recurringReminderClient>;
