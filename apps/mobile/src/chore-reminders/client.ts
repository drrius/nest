import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ChoreReminderQuery,
  ChoreReminderContext,
  SaveChoreReminder,
  ChoreReminderReceipt,
  ChoreReminderRecovery,
  canonicalChoreReminder,
  sameChoreReminderCommand,
} from "@nest/contracts/chore-reminders";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
const decode = <T>(schema: Schema.Codec<T>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
export function choreReminderClient(
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
  const command = (input: typeof SaveChoreReminder.Type) =>
    decode(SaveChoreReminder, input).pipe(Effect.map(canonicalChoreReminder));
  const recover = (input: typeof SaveChoreReminder.Type, cancel: boolean) =>
    Effect.gen(function* () {
      const expected = yield* command(input),
        operationId = expected.operationId;
      const result = yield* request(
        cancel
          ? "v1/chore-reminders/cancel-operation"
          : `v1/chore-reminders/operation?${new URLSearchParams({ operationId })}`,
        ChoreReminderRecovery,
        cancel ? { operationId } : undefined,
      );
      if (
        result.operationId !== operationId ||
        (result.receipt !== null && !sameChoreReminderCommand(result.receipt.command, expected))
      )
        return yield* unavailable();
      return result;
    });
  return {
    detail: (occurrenceId: string) =>
      Effect.gen(function* () {
        const query = yield* decode(ChoreReminderQuery, { occurrenceId });
        const target = query.occurrenceId.toLowerCase();
        const result = yield* request(
          `v1/chore-reminders/detail?${new URLSearchParams({ occurrenceId: target })}`,
          ChoreReminderContext,
        );
        if (result.chore.occurrenceId !== target) return yield* unavailable();
        return result;
      }),
    save: (input: typeof SaveChoreReminder.Type) =>
      Effect.gen(function* () {
        const expected = yield* command(input);
        const result = yield* request("v1/chore-reminders/save", ChoreReminderReceipt, expected);
        if (!sameChoreReminderCommand(result.command, expected)) return yield* unavailable();
        return result;
      }),
    recover: (input: typeof SaveChoreReminder.Type) => recover(input, false),
    cancel: (input: typeof SaveChoreReminder.Type) => recover(input, true),
  };
}
export type ChoreReminderClient = ReturnType<typeof choreReminderClient>;
