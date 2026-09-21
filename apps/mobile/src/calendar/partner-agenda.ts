import * as Schema from "effect/Schema";
import { BusySnapshot } from "@nest/contracts/calendar";
import { assessAgendaAvailability } from "@nest/domain/availability";
import type { Window } from "./availability.ts";
const Snapshots = Schema.Array(BusySnapshot).check(
  Schema.isMaxLength(2),
  Schema.makeFilter((rows) => new Set(rows.map((row) => row.actorId)).size === rows.length),
);
export function partnerAgenda(
  snapshots: readonly BusySnapshot[] | null,
  actor: string,
  query: Window,
  now: number,
) {
  if (!Schema.is(Snapshots)(snapshots)) return { status: "unknown" as const };
  const others = snapshots.filter((snapshot) => snapshot.actorId !== actor);
  if (others.length !== 1) return { status: "unknown" as const };
  const snapshot = others[0]!;
  return assessAgendaAvailability(
    {
      covered: snapshot.covered,
      intervals: snapshot.intervals,
      capturedAt: Date.parse(snapshot.capturedAt),
      expiresAt: Date.parse(snapshot.expiresAt),
    },
    query,
    now,
  );
}
