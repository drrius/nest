import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Member } from "./identity.ts";
import { ApiFailure } from "./errors.ts";
import { requestDocument } from "./supabase-request.ts";
import type { AuthorizedCaller } from "./chores/service.ts";
import type { IdentityConfig } from "./supabase-identity.ts";
export function readHouseholdMembers(config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const householdId = caller.member.householdId;
    const params = new URLSearchParams({
      household_id: `eq.${householdId}`,
      select: "userId:user_id,householdId:household_id,displayName:display_name",
      order: "user_id.asc",
      limit: "2",
    });
    const document = yield* requestDocument(
      config,
      caller.token,
      `rest/v1/household_members?${params}`,
    );
    const roster = yield* Schema.decodeUnknownEffect(
      Schema.Array(Member).check(Schema.isMinLength(1), Schema.isMaxLength(2)),
    )(document.value, { onExcessProperty: "error" }).pipe(
      Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
    );
    if (
      document.range !== `0-${roster.length - 1}/${roster.length}` ||
      roster.some((member) => member.householdId !== householdId) ||
      new Set(roster.map((member) => member.userId)).size !== roster.length ||
      !roster.some((member) => member.userId === caller.member.userId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return roster;
  });
}
