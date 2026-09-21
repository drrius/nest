import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveRecurring,
  ExecuteRecurring,
  RecurringInput,
  RecurringReceipt,
  canonicalRecurring,
} from "@nest/contracts/recurring";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
const equivalent = Schema.toEquivalence(RecurringInput);
export function recurringCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  const run = (input: unknown, approved: boolean) =>
    Effect.gen(function* () {
      const command = yield* Schema.decodeUnknownEffect(
        approved ? ExecuteRecurring : SaveRecurring,
      )(input, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
      const approvalId = Schema.is(ExecuteRecurring)(command)
        ? command.approvalId.toLowerCase()
        : null;
      const operationId = command.operationId.toLowerCase(),
        rule = canonicalRecurring(command.rule);
      const raw = yield* requestJson(
        config,
        caller.token,
        approved ? "rest/v1/rpc/nest_execute_recurring" : "rest/v1/rpc/nest_save_recurring",
        {
          p_household: caller.member.householdId,
          p_operation: operationId,
          p_input: rule,
          ...(approved ? { p_approval: approvalId } : {}),
        },
      );
      const result = yield* Schema.decodeUnknownEffect(RecurringReceipt)(raw, {
        onExcessProperty: "error",
      }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
      if (
        result.actorId !== caller.member.userId ||
        result.householdId !== caller.member.householdId ||
        result.operationId !== operationId ||
        result.approvalId !== approvalId ||
        !equivalent(result.rule, rule)
      )
        return yield* new ApiFailure({ code: "unavailable" });
      return result;
    });
  return {
    save: (input: unknown) => run(input, false),
    execute: (input: unknown) => run(input, true),
  };
}
