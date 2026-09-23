import { ReminderOperationQuery } from "@nest/contracts/reminders";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveChoreReminder,
  ChoreReminderReceipt,
  ChoreReminderContext,
  ChoreReminderRecovery,
  ChoreReminderQuery,
  canonicalChoreReminder,
  sameChoreReminderCommand,
} from "@nest/contracts/chore-reminders";
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
export function choreReminderService(config: IdentityConfig, caller: AuthorizedCaller) {
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
      const command = canonicalChoreReminder(
        yield* decode(SaveChoreReminder, input, "invalid_request"),
      );
      const { operationId, ...p_input } = command;
      const result = yield* rpc(ChoreReminderReceipt, "nest_save_chore_reminder", {
        p_operation: operationId,
        p_input,
      });
      if (!sameChoreReminderCommand(result.command, command))
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  return {
    save: (input: unknown) => change(input),
    read: (input: unknown) =>
      Effect.gen(function* () {
        const query = yield* decode(ChoreReminderQuery, input, "invalid_request"),
          id = query.occurrenceId.toLowerCase();
        const result = yield* rpc(ChoreReminderContext, "nest_read_chore_reminder", {
          p_occurrence: id,
        });
        if (result.chore.occurrenceId !== id) return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
    recover: (input: unknown, cancel: boolean) =>
      Effect.gen(function* () {
        const query = yield* decode(ReminderOperationQuery, input, "invalid_request"),
          operationId = query.operationId.toLowerCase();
        const result = yield* rpc(
          ChoreReminderRecovery,
          cancel ? "nest_cancel_chore_reminder_operation" : "nest_read_chore_reminder_operation",
          { p_operation: operationId },
        );
        if (result.operationId !== operationId)
          return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
  };
}
