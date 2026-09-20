import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  AssistantInputs,
  AssistantReceipts,
  CommandRejection,
  type AssistantAction,
} from "@nest/contracts/assistant-actions";
import { CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { requestJson } from "../supabase-request.ts";
import type { StartTurn } from "@nest/contracts/conversations";

const decode = <A>(schema: Schema.Codec<A>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new CommandFailure({ code: "unavailable" })),
  );
export function assistantCommands(request: Request, config: IdentityConfig, turn: StartTurn) {
  return (action: AssistantAction, input: unknown, call: string) =>
    Effect.gen(function* () {
      const member = yield* currentMember(request),
        token = yield* bearerToken(request);
      const schema: Schema.Codec<object> = AssistantInputs[action];
      const command = yield* decode(schema, input);
      const raw = yield* requestJson(config, token, "rest/v1/rpc/nest_execute_ai_command", {
        p_household: member.householdId,
        p_conversation: turn.conversationId,
        p_turn: turn.operationId,
        p_call: call,
        p_tool: action,
        p_input: command,
      });
      if (Schema.is(CommandRejection)(raw)) return yield* new CommandFailure({ code: raw.code });
      const receiptSchema: Schema.Codec<object> = AssistantReceipts[action];
      const result = yield* decode(
        Schema.Struct({ ok: Schema.Literal(true), value: receiptSchema }),
        raw,
      );
      if (!matchesCommand(command, result.value, action))
        return yield* new CommandFailure({ code: "unavailable" });
      return result.value;
    }).pipe(
      Effect.provide(supabaseIdentity(config)),
      Effect.mapError((error) =>
        Schema.is(CommandFailure)(error)
          ? error
          : new CommandFailure({
              code:
                error.code === "conflict"
                  ? "conflict"
                  : error.code === "unavailable"
                    ? "unavailable"
                    : "forbidden",
            }),
      ),
    );
}
function matchesCommand(input: object, receipt: object, action: AssistantAction) {
  if ("occurrenceId" in input && "occurrenceId" in receipt)
    return String(input.occurrenceId).toLowerCase() === receipt.occurrenceId;
  if (
    "itemId" in input &&
    "target" in receipt &&
    String(input.itemId).toLowerCase() !== receipt.target
  )
    return false;
  if ("checked" in input && "checked" in receipt && input.checked !== receipt.checked) return false;
  return !("removed" in receipt) || receipt.removed === (action === "removeGrocery");
}
