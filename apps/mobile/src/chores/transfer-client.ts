import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ChoreTransferList,
  ChoreTransferEnvelope,
  RequestChoreTransfer,
  RespondChoreTransfer,
} from "@nest/contracts/chore-transfers";
import { PreferenceFailure, preferenceRequests } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";

type Command = typeof RequestChoreTransfer.Type | typeof RespondChoreTransfer.Type;
export function choreTransfers(request: ReturnType<typeof preferenceRequests>, account: Account) {
  const write = (command: Command) =>
    Effect.gen(function* () {
      const responding = "requestId" in command;
      const { receipt } = yield* request(
        `v1/chores/transfers/${responding ? "respond" : "request"}`,
        ChoreTransferEnvelope,
        command,
      );
      const action = "action" in command ? command.action : "request";
      if (
        receipt.actorId !== account.actor ||
        receipt.householdId !== account.household ||
        receipt.operationId !== command.operationId.toLowerCase() ||
        receipt.action !== action ||
        !matchesTarget(receipt, command)
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      return receipt;
    });
  return {
    list: () =>
      request("v1/chores/transfers", ChoreTransferList).pipe(
        Effect.flatMap((result) => {
          const ids = new Set(result.members.map((member) => member.actorId));
          return result.householdId === account.household &&
            ids.has(account.actor) &&
            ids.size === result.members.length &&
            new Set(result.transfers.map((row) => row.requestId)).size ===
              result.transfers.length &&
            new Set(result.transfers.map((row) => row.occurrenceId)).size ===
              result.transfers.length &&
            result.transfers.every((row) => ids.has(row.fromMemberId) && ids.has(row.toMemberId))
            ? Effect.succeed(result)
            : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
        }),
      ),
    request: (input: typeof RequestChoreTransfer.Type) =>
      Schema.decodeUnknownEffect(RequestChoreTransfer)(input, { onExcessProperty: "error" }).pipe(
        Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
        Effect.flatMap(write),
      ),
    respond: (input: typeof RespondChoreTransfer.Type) =>
      Schema.decodeUnknownEffect(RespondChoreTransfer)(input, { onExcessProperty: "error" }).pipe(
        Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
        Effect.flatMap(write),
      ),
  };
}

function matchesTarget(receipt: (typeof ChoreTransferEnvelope.Type)["receipt"], command: Command) {
  return "requestId" in command
    ? receipt.requestId === command.requestId.toLowerCase()
    : receipt.occurrenceId === command.occurrenceId.toLowerCase() &&
        receipt.dueDate === command.expectedDueDate &&
        receipt.toMemberId === command.recipientId.toLowerCase();
}
