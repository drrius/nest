import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { AvailabilityQuery } from "@nest/contracts/calendar";
import { assessAvailability } from "@nest/domain/availability";
import { ApiFailure } from "../errors.ts";
import { readHouseholdMembers } from "../household-members.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { decode } from "./codec.ts";
import { readBusySnapshots } from "./read.ts";
export function readAvailability(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* decode(AvailabilityQuery, input, "invalid_request");
    const roster = yield* readHouseholdMembers(config, caller);
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
