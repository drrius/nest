import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { TurnIdentity } from "@nest/contracts/conversations";
import { ApiFailure } from "../errors.ts";
import { commandBody } from "../request-body.ts";
import { requestJson } from "../supabase-request.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";

export function cancelUnstartedTurn(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const identity = yield* Schema.decodeUnknownEffect(TurnIdentity)(yield* commandBody(request), {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const conversationId = identity.conversationId.toLowerCase();
    const operationId = identity.operationId.toLowerCase();
    const value = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_cancel_unstarted_ai_turn",
      {
        p_household: caller.member.householdId,
        p_conversation: conversationId,
        p_operation: operationId,
      },
    );
    const result = yield* Schema.decodeUnknownEffect(Schema.Struct({ cancelled: Schema.Boolean }))(
      value,
    ).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    return Response.json(
      {
        version: 1,
        actorId: caller.member.userId,
        householdId: caller.member.householdId,
        conversationId,
        operationId,
        cancelled: result.cancelled,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
