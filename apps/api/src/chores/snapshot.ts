import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ChoreSnapshot } from "@nest/contracts/chore-snapshot";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "./service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function choreSnapshot(config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_chore_snapshot", {
      p_household: caller.member.householdId,
    });
    const result = yield* Schema.decodeUnknownEffect(ChoreSnapshot)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      !result.members.some((member) => member.actorId === caller.member.userId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
