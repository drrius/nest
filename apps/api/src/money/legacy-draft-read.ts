import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyDraftList, LegacyDraftQuery } from "@nest/contracts/legacy-recurring-drafts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function readLegacyDrafts(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(LegacyDraftQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const after = query.after?.toLowerCase() ?? null;
    const ruleId = query.ruleId.toLowerCase();
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_read_legacy_drafts", {
      p_household: caller.member.householdId,
      p_after: after,
      p_rule: ruleId,
    });
    const result = yield* Schema.decodeUnknownEffect(LegacyDraftList)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      result.after !== after ||
      result.ruleId !== ruleId
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
export function legacyDraftRoute(url: URL, config: IdentityConfig, caller: AuthorizedCaller) {
  if (
    [...url.searchParams.keys()].some((key) => !["ruleId", "after"].includes(key)) ||
    url.searchParams.getAll("ruleId").length !== 1 ||
    url.searchParams.getAll("after").length > 1
  )
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return readLegacyDrafts(config, caller, {
    ruleId: url.searchParams.get("ruleId"),
    after: url.searchParams.get("after"),
  });
}
