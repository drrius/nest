import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyRecurringList, LegacyRecurringQuery } from "@nest/contracts/legacy-recurring";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function readLegacyRecurring(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(LegacyRecurringQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const after = query.after?.toLowerCase() ?? null;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_read_legacy_recurring", {
      p_household: caller.member.householdId,
      p_after: after,
    });
    const result = yield* Schema.decodeUnknownEffect(LegacyRecurringList)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (result.householdId !== caller.member.householdId || result.after !== after)
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
export function legacyRecurringRoute(url: URL, config: IdentityConfig, caller: AuthorizedCaller) {
  if (url.searchParams.size > 1 || [...url.searchParams.keys()].some((key) => key !== "after"))
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return readLegacyRecurring(config, caller, { after: url.searchParams.get("after") });
}
