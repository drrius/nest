import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SkipChore, RescheduleChore } from "@nest/contracts/routines";
import { ChoreChangeReceipt } from "@nest/contracts/chore-changes";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "./service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function changeChore(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  action: "skip" | "reschedule",
  input: unknown,
) {
  return Effect.gen(function* () {
    const schema: Schema.Codec<typeof SkipChore.Type | typeof RescheduleChore.Type> =
      action === "skip" ? SkipChore : RescheduleChore;
    const command = yield* Schema.decodeUnknownEffect(schema)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const nextDate = "newDueDate" in command ? command.newDueDate : null;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_change_chore", {
      p_household: caller.member.householdId,
      p_operation: command.operationId.toLowerCase(),
      p_occurrence: command.occurrenceId.toLowerCase(),
      p_expected_due_date: command.expectedDueDate,
      p_action: action,
      p_new_due_date: nextDate,
    });
    const receipt = yield* Schema.decodeUnknownEffect(ChoreChangeReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (!matchesReceipt(receipt, command, caller, action))
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}

function matchesReceipt(
  receipt: typeof ChoreChangeReceipt.Type,
  command: typeof SkipChore.Type | typeof RescheduleChore.Type,
  caller: AuthorizedCaller,
  action: "skip" | "reschedule",
) {
  const dueDate = "newDueDate" in command ? command.newDueDate : command.expectedDueDate;
  return (
    receipt.actorId === caller.member.userId &&
    receipt.householdId === caller.member.householdId &&
    receipt.operationId === command.operationId.toLowerCase() &&
    receipt.occurrenceId === command.occurrenceId.toLowerCase() &&
    receipt.action === action &&
    receipt.previousDueDate === command.expectedDueDate &&
    receipt.dueDate === dueDate
  );
}
