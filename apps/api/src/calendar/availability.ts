import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { AvailabilityQuery } from "@nest/contracts/calendar";
import { assessAvailability } from "@nest/domain/availability";
import { Member } from "../identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestDocument } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { decode } from "./codec.ts";
import { readBusySnapshots } from "./read.ts";
export function readAvailability(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* decode(AvailabilityQuery, input, "invalid_request");
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
    const roster = yield* decode(
      Schema.Array(Member).check(Schema.isMinLength(1), Schema.isMaxLength(2)),
      document.value,
    );
    if (
      document.range !== `0-${roster.length - 1}/${roster.length}` ||
      roster.some((member) => member.householdId !== householdId) ||
      new Set(roster.map((member) => member.userId)).size !== roster.length ||
      !roster.some((member) => member.userId === caller.member.userId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    const evidence = yield* readBusySnapshots(config, caller);
    if (
      evidence.snapshots.some(
        (snapshot) => !roster.some((member) => member.userId === snapshot.actorId),
      )
    )
      return yield* new ApiFailure({ code: "unavailable" });
    const now = yield* Clock.currentTimeMillis;
    return {
      query,
      asOf: now,
      members: roster.map((member) => {
        const snapshot = evidence.snapshots.find((snapshot) => snapshot.actorId === member.userId);
        return {
          actorId: member.userId,
          displayName: member.displayName,
          ...assessAvailability(
            snapshot
              ? {
                  covered: snapshot.covered,
                  intervals: snapshot.intervals,
                  capturedAt: Date.parse(snapshot.capturedAt),
                  expiresAt: Date.parse(snapshot.expiresAt),
                }
              : null,
            query,
            now,
          ),
        };
      }),
    };
  });
}
