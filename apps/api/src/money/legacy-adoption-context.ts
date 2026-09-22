import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyAdoptionContext, LegacyAdoptionContextQuery } from "@nest/contracts/legacy-adoption";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function legacyAdoptionContext(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(LegacyAdoptionContextQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const ruleId = query.ruleId.toLowerCase();
    const raw = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_read_legacy_adoption_context",
      { p_household: caller.member.householdId, p_rule: ruleId },
    );
    const result = yield* Schema.decodeUnknownEffect(LegacyAdoptionContext)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (result.householdId !== caller.member.householdId || result.rule.ruleId !== ruleId)
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
