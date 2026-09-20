import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { TurnReceipt, ConversationRevision, type StartTurn } from "@nest/contracts/conversations";
import { ApiFailure } from "../errors.ts";
import { requestDocument, requestJson } from "../supabase-request.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
const Row = Schema.Struct({
  id: Schema.String,
  actorId: Schema.String,
  householdId: Schema.String,
  version: Schema.Literal(1),
  revision: ConversationRevision,
  transcript: Schema.Array(Schema.Unknown),
});
const decode = <A>(schema: Schema.Codec<A>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
  );
export function conversationStore(config: IdentityConfig, caller: AuthorizedCaller) {
  const rpc = (name: string, body: object) =>
    requestJson(config, caller.token, `rest/v1/rpc/${name}`, {
      p_household: caller.member.householdId,
      ...body,
    }).pipe(Effect.flatMap((value) => decode(TurnReceipt, value)));
  return {
    read: (conversation: string) =>
      Effect.gen(function* () {
        const query = new URLSearchParams({
          select:
            "id,actorId:actor_id,householdId:household_id,version:schema_version,revision:revision::text,transcript",
          id: `eq.${conversation}`,
          actor_id: `eq.${caller.member.userId}`,
          household_id: `eq.${caller.member.householdId}`,
          limit: "1",
        });
        const document = yield* requestDocument(
          config,
          caller.token,
          `rest/v1/nest_ai_conversations?${query}`,
        );
        const rows = yield* decode(Schema.Array(Row), document.value);
        if (rows.length === 0 && document.range === "*/0") return null;
        const row = yield* decode(Row, rows[0]);
        if (
          rows.length !== 1 ||
          document.range !== "0-0/1" ||
          row.id !== conversation ||
          row.actorId !== caller.member.userId ||
          row.householdId !== caller.member.householdId
        )
          return yield* new ApiFailure({ code: "unavailable" });
        if (
          row.transcript.length > 1000 ||
          new TextEncoder().encode(JSON.stringify(row.transcript)).length > 2097152
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return { conversationId: row.id, revision: row.revision, messages: row.transcript };
      }),
    begin: (input: StartTurn) =>
      rpc("nest_begin_ai_turn", {
        p_conversation: input.conversationId,
        p_operation: input.operationId,
        p_expected: input.expectedRevision,
        p_message: {
          id: input.operationId,
          role: "user",
          parts: [{ type: "text", text: input.text }],
        },
      }),
    finish: (
      input: Pick<StartTurn, "conversationId" | "operationId">,
      response: unknown,
      completed: boolean,
    ) =>
      rpc("nest_finish_ai_turn", {
        p_conversation: input.conversationId,
        p_operation: input.operationId,
        p_state: completed ? "completed" : "interrupted",
        p_response: response,
      }),
  };
}

const TurnRow = Schema.Struct({
  ...TurnReceipt.fields,
  actorId: Schema.String,
  householdId: Schema.String,
  conversationId: Schema.String,
  operationId: Schema.String,
});
export function readTurn(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: { conversationId: string; operationId: string },
) {
  return Effect.gen(function* () {
    const query = new URLSearchParams({
      select:
        "conversationId:conversation_id,operationId:operation_id,actorId:actor_id,householdId:household_id,state,assistantId:assistant_id,inputRevision:input_revision::text,finalRevision:final_revision::text,deadline:deadline_at",
      conversation_id: `eq.${input.conversationId}`,
      operation_id: `eq.${input.operationId}`,
      actor_id: `eq.${caller.member.userId}`,
      household_id: `eq.${caller.member.householdId}`,
      limit: "1",
    });
    const document = yield* requestDocument(config, caller.token, `rest/v1/nest_ai_turns?${query}`);
    const values = yield* decode(Schema.Array(Schema.Unknown), document.value);
    if (values.length === 0 && document.range === "*/0") return null;
    const value = yield* decode(
      Schema.Struct({ ...TurnRow.fields, claimed: Schema.optionalKey(Schema.Boolean) }),
      values[0],
    );
    if (
      values.length !== 1 ||
      document.range !== "0-0/1" ||
      value.actorId !== caller.member.userId ||
      value.householdId !== caller.member.householdId ||
      value.conversationId !== input.conversationId ||
      value.operationId !== input.operationId
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return yield* decode(TurnReceipt, {
      claimed: false,
      state: value.state,
      assistantId: value.assistantId,
      inputRevision: value.inputRevision,
      finalRevision: value.finalRevision,
      deadline: value.deadline,
    });
  });
}
