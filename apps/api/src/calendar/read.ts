import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Struct from "effect/Struct";
import { BusySnapshot, BusySnapshotsEnvelope } from "@nest/contracts/calendar";
import { ApiFailure } from "../errors.ts";
import { requestDocument } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { decode } from "./codec.ts";
const Row = Schema.Struct({ ...BusySnapshot.fields, householdId: Schema.String });
export function readBusySnapshots(config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const householdId = caller.member.householdId;
    const query = new URLSearchParams({
      household_id: `eq.${householdId}`,
      order: "actor_id.asc",
      limit: "2",
      select:
        "actorId:actor_id,householdId:household_id,schemaVersion:schema_version,consent:consent_version::text,generation:generation::text,capturedAt:captured_at,expiresAt:expires_at,coveredStart:covered_start,coveredEnd:covered_end,intervals",
    });
    const RawRow = Schema.Struct({
      ...Struct.omit(Row.fields, ["covered"]),
      coveredStart: Schema.Number,
      coveredEnd: Schema.Number,
    });
    const document = yield* requestDocument(
      config,
      caller.token,
      `rest/v1/nest_busy_snapshots?${query}`,
    );
    const raw = yield* decode(Schema.Array(RawRow).check(Schema.isMaxLength(2)), document.value);
    const range = raw.length ? `0-${raw.length - 1}/${raw.length}` : "*/0";
    if (document.range !== range || raw.some((row) => row.householdId !== householdId))
      return yield* new ApiFailure({ code: "unavailable" });
    const envelope = yield* decode(BusySnapshotsEnvelope, {
      version: 1,
      householdId,
      snapshots: raw.map(({ householdId: _householdId, coveredStart, coveredEnd, ...row }) => ({
        ...row,
        covered: { start: coveredStart, end: coveredEnd },
      })),
    });
    const now = yield* Clock.currentTimeMillis;
    return {
      ...envelope,
      snapshots: envelope.snapshots.filter(
        (row) => Date.parse(row.capturedAt) <= now && Date.parse(row.expiresAt) > now,
      ),
    };
  });
}
