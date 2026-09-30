import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  GroceryReminderQuery,
  GroceryReminderContext,
  SaveGroceryReminder,
  GroceryReminderReceipt,
  GroceryReminderRecovery,
  canonicalGroceryReminder,
  sameGroceryReminderCommand,
} from "@nest/contracts/grocery-reminders";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
const decode = <T>(schema: Schema.Codec<T>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
export function groceryReminderClient(
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
  const command = (input: typeof SaveGroceryReminder.Type) =>
    decode(SaveGroceryReminder, input).pipe(Effect.map(canonicalGroceryReminder));
  const recover = (input: typeof SaveGroceryReminder.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const expected = yield* command(input),
        operationId = expected.operationId;
      const result = yield* request(
        cancel
          ? "v1/grocery-reminders/cancel-operation"
          : `v1/grocery-reminders/operation?${new URLSearchParams({ operationId })}`,
        GroceryReminderRecovery,
        cancel ? { operationId } : undefined,
      );
      if (
        result.operationId !== operationId ||
        (result.receipt !== null && !sameGroceryReminderCommand(result.receipt.command, expected))
      )
        return yield* unavailable();
      return result;
    });
  return {
    detail: (itemId: string) =>
      Effect.gen(function* () {
        const query = yield* decode(GroceryReminderQuery, { itemId });
        const target = query.itemId.toLowerCase();
        const result = yield* request(
          `v1/grocery-reminders/detail?${new URLSearchParams({ itemId: target })}`,
          GroceryReminderContext,
        );
        if (result.grocery.itemId !== target) return yield* unavailable();
        return result;
      }),
    save: (input: typeof SaveGroceryReminder.Type) =>
      Effect.gen(function* () {
        const expected = yield* command(input);
        const result = yield* request(
          "v1/grocery-reminders/save",
          GroceryReminderReceipt,
          expected,
        );
        if (!sameGroceryReminderCommand(result.command, expected)) return yield* unavailable();
        return result;
      }),
    recover: (input: typeof SaveGroceryReminder.Type) => recover(input, false),
    cancel: (input: typeof SaveGroceryReminder.Type) => recover(input, true),
  };
}
export type GroceryReminderClient = ReturnType<typeof groceryReminderClient>;
