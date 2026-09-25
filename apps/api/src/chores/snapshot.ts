import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ChoreSnapshot } from "@nest/contracts/chore-snapshot";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "./service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

const EpochSnapshot = Schema.Struct({
  ...ChoreSnapshot.fields,
  offlineEpoch: Schema.String.check(Schema.isUUID()),
});

export function choreSnapshot(config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_chore_epoch_snapshot", {
      p_household: caller.member.householdId,
    });
    const snapshot = yield* Schema.decodeUnknownEffect(EpochSnapshot)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    const { offlineEpoch, ...data } = snapshot;
    const result = yield* Schema.decodeUnknownEffect(ChoreSnapshot)({
      ...data,
      chores: data.chores.map((chore) => ({ ...chore, offlineEpoch })),
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      !result.members.some((member) => member.actorId === caller.member.userId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}
