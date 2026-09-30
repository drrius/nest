import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { DefaultChatTransport, validateUIMessages } from "ai";
import type { AssistantMessage } from "@nest/ai/chat";
import {
  ConversationPage,
  ConversationRevision,
  TurnReceipt,
  StartTurn,
} from "@nest/contracts/conversations";
import type { ChoreFailure } from "../chores/client.ts";
import type { Credentials } from "../session/verification.ts";
import type { Account } from "../offline/contracts.ts";
import { assistantRequests, failure } from "./request.ts";

const Uuid = Schema.String.check(Schema.isUUID());
const Saved = Schema.Struct({
  conversationId: Uuid,
  revision: ConversationRevision,
  messages: Schema.Array(Schema.Unknown).check(Schema.isMaxLength(1000)),
});
const History = Schema.Struct({ version: Schema.Literal(1), conversation: Schema.NullOr(Saved) });
export function assistantClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
  fetcher: typeof globalThis.fetch,
) {
  const { authorized, json } = assistantRequests(apiUrl, account, credentials, fetcher);
  return {
    list: (cursor?: string) =>
      json(
        `v1/assistant/conversations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
        ConversationPage,
      ).pipe(
        Effect.flatMap((page) =>
          page.actorId === account.actor && page.householdId === account.household
            ? Effect.succeed(page)
            : Effect.fail(failure(503)),
        ),
      ),
    read: (id: string) =>
      json(`v1/assistant/conversation?id=${encodeURIComponent(id)}`, History).pipe(
        Effect.flatMap(({ conversation }) =>
          Effect.tryPromise({
            try: async () => {
              if (!conversation) return { revision: "0", messages: [] as AssistantMessage[] };
              if (conversation.conversationId !== id) throw failure(503);
              const messages = await validateUIMessages<AssistantMessage>({
                messages: [...conversation.messages],
              });
              if (messages.some((message) => message.role === "system")) throw failure(503);
              return { revision: conversation.revision, messages };
            },
            catch: () => failure(503),
          }),
        ),
      ),
    turn: (conversationId: string, operationId: string, interrupt = false) => {
      const identity = { conversationId, operationId };
      const path = interrupt
        ? "v1/assistant/interrupt"
        : `v1/assistant/turn?${new URLSearchParams(identity)}`;
      // Read/recovery envelopes contain identity, not the original private prompt.
      const envelope = Schema.Struct({
        version: Schema.Literal(1),
        conversationId: Uuid,
        operationId: Uuid,
        turn: TurnReceipt,
      });
      return json(path, envelope, interrupt ? identity : undefined).pipe(
        Effect.flatMap((value) =>
          value.conversationId === conversationId && value.operationId === operationId
            ? Effect.succeed(value.turn)
            : Effect.fail(failure(503)),
        ),
      );
    },
    transport: (command: () => StartTurn | null) =>
      new DefaultChatTransport<AssistantMessage>({
        api: new URL("v1/assistant/turn", apiUrl).href,
        fetch: (_url, init) => authorized("v1/assistant/turn", init),
        prepareSendMessagesRequest: ({ trigger, messages }) => {
          const input = command(),
            message = messages.at(-1);
          if (
            trigger !== "submit-message" ||
            !input ||
            message?.id !== input.operationId ||
            message.role !== "user"
          )
            throw failure(400);
          return { body: Schema.decodeUnknownSync(StartTurn)(input) };
        },
        prepareReconnectToStreamRequest: () => {
          throw failure(400);
        },
      }),
  };
}
export type AssistantClient = ReturnType<typeof assistantClient>;
