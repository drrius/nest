import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { TurnIdentity } from "@nest/contracts/conversations";
import { ApiFailure } from "../errors.ts";
import { commandBody } from "../request-body.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import { conversationStore, readTurn } from "./store.ts";
export function recoverTurn(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const query = new URL(request.url).searchParams;
    const value =
      request.method === "GET"
        ? {
            conversationId: query.get("conversationId"),
            operationId: query.get("operationId"),
          }
        : yield* commandBody(request);
    const decoded = yield* Schema.decodeUnknownEffect(TurnIdentity)(value, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const input = {
      conversationId: decoded.conversationId.toLowerCase(),
      operationId: decoded.operationId.toLowerCase(),
    };
    let turn = yield* readTurn(config, caller, input);
    if (!turn) return yield* new ApiFailure({ code: "removed" });
    if (request.method === "POST" && turn.state === "running") {
      if (Date.now() < Date.parse(turn.deadline))
        return yield* new ApiFailure({ code: "conflict" });
      turn = yield* conversationStore(config, caller).finish(input, null, false);
    }
    return Response.json(
      { version: 1, ...input, turn },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
