import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CorrectionContext, CorrectionContextQuery } from "@nest/contracts/correction-context";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function readCorrectionContext(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(CorrectionContextQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const sourceEventId = query.sourceEventId.toLowerCase();
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_correction_context", {
      p_household: caller.member.householdId,
      p_source: sourceEventId,
    });
    const result = yield* Schema.decodeUnknownEffect(CorrectionContext)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      result.source.event.eventId !== sourceEventId ||
      !result.source.shares.some((share) => share.memberId === caller.member.userId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
