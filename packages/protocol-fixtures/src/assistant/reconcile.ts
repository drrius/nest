import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { UIMessage } from "ai";
import type { StartTurn } from "@nest/contracts/conversations";
import type { AssistantClient } from "./client.ts";
import { AssistantFailure } from "./request.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export function reconcileConversation(
  client: AssistantClient,
  id: string,
  attempt: StartTurn | null,
) {
  return Effect.gen(function* () {
    let saved = yield* client.read(id);
    const { operation, turn } = yield* currentTurn(client, id, saved.messages, attempt);
    const finalRevision = turn?.finalRevision;
    if (finalRevision && BigInt(saved.revision) < BigInt(finalRevision))
      saved = yield* client.read(id);
    if (finalRevision && BigInt(saved.revision) < BigInt(finalRevision))
      return yield* new AssistantFailure({ code: "unavailable" });
    return { saved, operation, turn };
  });
}
export const turnNotice = (state?: string) =>
  state === "running"
    ? "This response is still being saved. Reload to check its status."
    : state === "interrupted"
      ? "The previous response was interrupted. Its saved content is shown below."
      : null;

function latestPrompt(messages: UIMessage[]) {
  const last = messages.at(-1);
  return last?.role === "user" && Schema.is(Uuid)(last.id) ? last.id : null;
}

function currentTurn(
  client: AssistantClient,
  id: string,
  messages: UIMessage[],
  attempt: StartTurn | null,
) {
  const read = (operation: string | null) =>
    operation
      ? client
          .turn(id, operation)
          .pipe(
            Effect.catchTag("AssistantFailure", (error) =>
              error.code === "missing" ? Effect.succeed(null) : Effect.fail(error),
            ),
          )
      : Effect.succeed(null);
  return Effect.gen(function* () {
    let operation = attempt?.operationId ?? latestPrompt(messages);
    let turn = yield* read(operation);
    const latest = latestPrompt(messages);
    if (!turn && latest !== operation) {
      operation = latest;
      turn = yield* read(operation);
    }
    return { operation, turn };
  });
}
