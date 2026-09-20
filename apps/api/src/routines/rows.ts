import * as Schema from "effect/Schema";
import {
  RoutineSchedule,
  Routine,
  RoutineVersion,
  StoredRoutineDefinition,
} from "@nest/contracts/routines";
const Uuid = Routine.fields.routineId;
export const RoutineRow = Schema.Struct({
  id: Uuid,
  household_id: Uuid,
  title: StoredRoutineDefinition.fields.title,
  schedule_rule: RoutineSchedule,
  assignment_policy: Schema.Literals(["shared", "assigned", "alternating"]),
  assigned_member_id: Schema.NullOr(Uuid),
  rotation_anchor_member_id: Schema.NullOr(Uuid),
  paused_at: Schema.NullOr(
    Schema.String.check(
      Schema.makeFilter((value: string) =>
        Schema.is(RoutineVersion)(canonicalRoutineVersion(value)),
      ),
    ),
  ),
  archived_at: Schema.Null,
  updated_at: Schema.String,
});
export type RoutineRow = typeof RoutineRow.Type;
export function canonicalRoutineVersion(value: string): string | null {
  const match =
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})(?![\s\S])/.exec(
      value,
    );
  if (!match) return null;
  const fraction = (match[2] ?? "").padEnd(6, "0");
  if (!Schema.is(RoutineVersion)(`${match[1]}.${fraction}Z`)) return null;
  const instant = new Date(`${match[1]}.${fraction.slice(0, 3)}${match[3]}`);
  if (!Number.isFinite(instant.getTime())) return null;
  // Offsets are whole minutes. Convert the calendar/time part and restore the
  // untouched fraction rather than using Date's millisecond-rounded version.
  return `${instant.toISOString().slice(0, -5)}.${fraction}Z`;
}
export function routineAssignment(row: RoutineRow) {
  if (
    row.assignment_policy === "shared" &&
    row.assigned_member_id === null &&
    row.rotation_anchor_member_id === null
  )
    return { policy: "shared" as const };
  if (
    row.assignment_policy === "assigned" &&
    row.assigned_member_id !== null &&
    row.rotation_anchor_member_id === null
  )
    return { policy: "assigned" as const, memberId: row.assigned_member_id };
  if (
    row.assignment_policy === "alternating" &&
    row.rotation_anchor_member_id !== null &&
    row.assigned_member_id === null
  )
    return { policy: "alternating" as const, anchorMemberId: row.rotation_anchor_member_id };
  return null;
}
