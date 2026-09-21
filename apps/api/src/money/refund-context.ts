import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RefundContext, RefundContextQuery } from "@nest/contracts/refund";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function readRefundContext(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(RefundContextQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const sourceEventId = query.sourceEventId.toLowerCase();
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_refund_context", {
      p_household: caller.member.householdId,
      p_source: sourceEventId,
    });
    const result = yield* Schema.decodeUnknownEffect(RefundContext)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      result.source.event.eventId !== sourceEventId ||
      !result.remaining.some((share) => share.memberId === caller.member.userId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
