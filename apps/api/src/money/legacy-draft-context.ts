import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  LegacyDraftContext,
  LegacyDraftContextQuery,
} from "@nest/contracts/legacy-draft-dismissal";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function legacyDraftContext(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(LegacyDraftContextQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const draftId = query.draftId.toLowerCase();
    const raw = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_read_legacy_draft_context",
      { p_household: caller.member.householdId, p_draft: draftId },
    );
    const result = yield* Schema.decodeUnknownEffect(LegacyDraftContext)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (result.householdId !== caller.member.householdId || result.draft.draftId !== draftId)
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
