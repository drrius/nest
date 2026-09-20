import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Weekday = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 7 }));
// PostgreSQL stores the interval as int32. Date arithmetic is validated by the
// command against its actual anchor; decoding alone does not prove a valid window.
const Interval = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 2147483647 }));
export const RoutineSchedule = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("one_off"), date: CalendarDate }),
  Schema.Struct({ kind: Schema.Literal("daily") }),
  Schema.Struct({
    kind: Schema.Literal("weekdays"),
    days: Schema.Array(Weekday).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(7),
      Schema.makeFilter((days: readonly number[]) => new Set(days).size === days.length),
    ),
  }),
  Schema.Struct({ kind: Schema.Literal("weekly"), weekday: Weekday }),
  Schema.Struct({ kind: Schema.Literal("biweekly"), weekday: Weekday }),
  Schema.Struct({
    kind: Schema.Literal("monthly"),
    dayOfMonth: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 31 })),
  }),
  Schema.Struct({
    kind: Schema.Literal("after_completion"),
    every: Interval,
    unit: Schema.Literals(["days", "weeks"]),
  }),
]);
export type RoutineSchedule = typeof RoutineSchedule.Type;
export const RoutineAssignment = Schema.Union([
  Schema.Struct({ policy: Schema.Literal("shared") }),
  Schema.Struct({ policy: Schema.Literal("assigned"), memberId: Uuid }),
  Schema.Struct({ policy: Schema.Literal("alternating"), anchorMemberId: Uuid }),
]);
export type RoutineAssignment = typeof RoutineAssignment.Type;
const Title = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(120),
  Schema.makeFilter((value: string) => value.trim().length > 0 && !value.includes("\u0000")),
);
export const RoutineDefinition = Schema.Struct({
  title: Title,
  schedule: RoutineSchedule,
  assignment: RoutineAssignment,
});
export type RoutineDefinition = typeof RoutineDefinition.Type;
export const CreateRoutine = Schema.Struct({
  operationId: Uuid,
  definition: RoutineDefinition,
});
export type CreateRoutine = typeof CreateRoutine.Type;
// Preserve PostgreSQL microseconds: never round an edit baseline through Date.
export const RoutineVersion = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z(?![\s\S])/),
  Schema.makeFilter((value: string) => {
    const date = new Date(value);
    return (
      Number.isFinite(date.getTime()) &&
      date.getUTCFullYear() > 0 &&
      date.toISOString() === `${value.slice(0, 23)}Z`
    );
  }),
);
export const EditRoutine = Schema.Struct({
  operationId: Uuid,
  routineId: Uuid,
  expectedVersion: RoutineVersion,
  definition: RoutineDefinition,
});
export type EditRoutine = typeof EditRoutine.Type;
export const RoutineStateCommand = Schema.Struct({
  operationId: Uuid,
  routineId: Uuid,
  expectedVersion: RoutineVersion,
  action: Schema.Literals(["pause", "resume", "archive"]),
});
export const SkipChore = Schema.Struct({
  operationId: Uuid,
  occurrenceId: Uuid,
  expectedDueDate: CalendarDate,
});
export const RescheduleChore = Schema.Struct({
  ...SkipChore.fields,
  newDueDate: CalendarDate,
}).check(Schema.makeFilter((command) => command.expectedDueDate !== command.newDueDate));
export const Routine = Schema.Struct({
  routineId: Uuid,
  version: RoutineVersion,
  definition: RoutineDefinition,
  state: Schema.Literals(["active", "paused", "archived"]),
});
export type Routine = typeof Routine.Type;
export const RoutineList = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  routines: Schema.Array(Routine),
});
export const RoutineReceipt = Schema.Struct({
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  routineId: Uuid,
  version: RoutineVersion,
  action: Schema.Literals(["create", "edit", "pause", "resume", "archive"]),
});
