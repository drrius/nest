import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  assistantStream,
  validateHistory,
  type AssistantModel,
  type AssistantTools,
} from "@nest/ai/chat";
import { StartTurn } from "@nest/contracts/conversations";
import { ApiFailure, failureResponse } from "../errors.ts";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { commandBody } from "../request-body.ts";
import { householdTools } from "./tools.ts";
import { recoverTurn } from "./recovery.ts";
import { conversationStore } from "./store.ts";
import { discoverConversations } from "./discovery.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const noStore = { "Cache-Control": "no-store" };
const parse = <A>(schema: Schema.Codec<A>, value: unknown) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code: "invalid_request" })),
  );
export function assistantHandler(config: IdentityConfig, model?: AssistantModel) {
  return (request: Request) => {
    const path = new URL(request.url).pathname;
    const allowed =
      path === "/v1/assistant/turn"
        ? ["GET", "POST"]
        : [path === "/v1/assistant/interrupt" ? "POST" : "GET"];
    if (!allowed.includes(request.method))
      return Promise.resolve(
        new Response(null, { status: 405, headers: { Allow: allowed.join(", ") } }),
      );
    const effect = Effect.gen(function* () {
      const member = yield* currentMember(request),
        token = yield* bearerToken(request);
      const store = conversationStore(config, { member, token });
      if (path === "/v1/assistant/conversations")
        return Response.json(yield* discoverConversations(request, config, { member, token }), {
          headers: noStore,
        });
      if (
        path === "/v1/assistant/interrupt" ||
        (path === "/v1/assistant/turn" && request.method === "GET")
      )
        return yield* recoverTurn(request, config, { member, token });
      if (path === "/v1/assistant/conversation") {
        const id = yield* parse(Uuid, new URL(request.url).searchParams.get("id"));
        const conversation = yield* store.read(id.toLowerCase());
        return Response.json({ version: 1, conversation }, { headers: noStore });
      }
      if (!model) return yield* new ApiFailure({ code: "unavailable" });
      const raw = yield* parse(StartTurn, yield* commandBody(request));
      const input = {
        ...raw,
        conversationId: raw.conversationId.toLowerCase(),
        operationId: raw.operationId.toLowerCase(),
      };
      return yield* startResponse(request, store, input, {
        model,
        tools: householdTools(request, config, { householdId: member.householdId, turn: input }),
      });
    }).pipe(
      Effect.provide(supabaseIdentity(config)),
      Effect.catchTag("ApiFailure", (error) => Effect.succeed(failureResponse(error))),
    );
    return Effect.runPromise(effect, { signal: request.signal }).catch(() =>
      failureResponse(new ApiFailure({ code: "unavailable" })),
    );
  };
}
function startResponse(
  request: Request,
  store: ReturnType<typeof conversationStore>,
  input: StartTurn,
  { model, tools }: { model: AssistantModel; tools: AssistantTools },
) {
  return Effect.gen(function* () {
    const turn = yield* store.begin(input);
    if (!turn.claimed)
      return Response.json(
        { version: 1, ...input, text: undefined, turn },
        { status: 409, headers: noStore },
      );
    return yield* Effect.tryPromise({
      try: async () => {
        try {
          const conversation = await Effect.runPromise(store.read(input.conversationId));
          if (!conversation || conversation.revision !== turn.inputRevision)
            throw new Error("Turn history unavailable");
          const messages = await validateHistory([...conversation.messages], tools);
          const last = messages.at(-1);
          if (last?.id !== input.operationId || last.role !== "user")
            throw new Error("Turn history changed");
          return await assistantStream({
            model,
            tools,
            messages,
            assistantId: turn.assistantId,
            signal: request.signal,
            finish: async (response, completed) => {
              await Effect.runPromise(store.finish(input, response, completed));
            },
          });
        } catch (error) {
          await Effect.runPromise(store.finish(input, null, false)).catch(() => undefined);
          throw error;
        }
      },
      catch: () => new ApiFailure({ code: "unavailable" }),
    });
  });
}
