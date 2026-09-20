import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  RequestChoreTransfer,
  RespondChoreTransfer,
  ChoreTransferReceipt,
  PendingChoreTransfer,
} from "@nest/contracts/chore-transfers";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import { readHouseholdMembers } from "../household-members.ts";
import type { AuthorizedCaller } from "./service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

type Command = typeof RequestChoreTransfer.Type | typeof RespondChoreTransfer.Type;
export function choreTransfers(config: IdentityConfig, caller: AuthorizedCaller) {
  return {
    list: () =>
      Effect.gen(function* () {
        const roster = yield* readHouseholdMembers(config, caller);
        const raw = yield* requestJson(
          config,
          caller.token,
          "rest/v1/rpc/nest_list_chore_transfers",
          { p_household: caller.member.householdId },
        );
        const transfers = yield* Schema.decodeUnknownEffect(
          Schema.Array(PendingChoreTransfer).check(Schema.isMaxLength(200)),
        )(raw, { onExcessProperty: "error" }).pipe(
          Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
        );
        const members = roster.map((member) => ({
          actorId: member.userId,
          displayName: member.displayName,
        }));
        const ids = new Set(members.map((member) => member.actorId));
        if (
          new Set(transfers.map((row) => row.requestId)).size !== transfers.length ||
          new Set(transfers.map((row) => row.occurrenceId)).size !== transfers.length ||
          transfers.some((row) => !ids.has(row.fromMemberId) || !ids.has(row.toMemberId))
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return { transfers, members };
      }),
    request: (input: unknown) =>
      decodeCommand(RequestChoreTransfer, input).pipe(
        Effect.flatMap((command) => executeTransfer(config, caller, command)),
      ),
    respond: (input: unknown) =>
      decodeCommand(RespondChoreTransfer, input).pipe(
        Effect.flatMap((command) => executeTransfer(config, caller, command)),
      ),
  };
}
function decodeCommand<A>(schema: Schema.Codec<A>, input: unknown) {
  return Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code: "invalid_request" })),
  );
}
function executeTransfer(config: IdentityConfig, caller: AuthorizedCaller, command: Command) {
  return Effect.gen(function* () {
    const action = "action" in command ? command.action : "request";
    const input =
      "requestId" in command
        ? { requestId: command.requestId.toLowerCase() }
        : {
            occurrenceId: command.occurrenceId.toLowerCase(),
            expectedDueDate: command.expectedDueDate,
            recipientId: command.recipientId.toLowerCase(),
          };
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_chore_transfer", {
      p_household: caller.member.householdId,
      p_operation: command.operationId.toLowerCase(),
      p_action: action,
      p_input: input,
    });
    const receipt = yield* Schema.decodeUnknownEffect(ChoreTransferReceipt)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      receipt.actorId !== caller.member.userId ||
      receipt.householdId !== caller.member.householdId ||
      receipt.operationId !== command.operationId.toLowerCase() ||
      receipt.action !== action ||
      !matchesTarget(receipt, command)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}
function matchesTarget(receipt: typeof ChoreTransferReceipt.Type, command: Command) {
  return "requestId" in command
    ? receipt.requestId === command.requestId.toLowerCase()
    : receipt.occurrenceId === command.occurrenceId.toLowerCase() &&
        receipt.dueDate === command.expectedDueDate &&
        receipt.toMemberId === command.recipientId.toLowerCase();
}
