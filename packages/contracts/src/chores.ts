import * as Schema from "effect/Schema";

const Uuid = Schema.String.check(Schema.isUUID());
export const CalendarDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/),
  Schema.makeFilter((value: string) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.getUTCFullYear() > 0 &&
      date.toISOString().slice(0, 10) === value
    );
  }),
);
export const CompleteChore = Schema.Struct({
  offlineEpoch: Schema.optionalKey(Uuid),
  operationId: Uuid,
  occurrenceId: Uuid,
  expectedDueDate: CalendarDate,
  completedOn: CalendarDate,
});
export type CompleteChore = typeof CompleteChore.Type;
export const Completion = Schema.Struct({
  version: Schema.Literal(1),
  operationId: Uuid,
  occurrenceId: Uuid,
  completedBy: Uuid,
  completedOn: CalendarDate,
  outcome: Schema.Literals(["completed", "already_completed"]),
});
export const Chore = Schema.Struct({
  offlineEpoch: Schema.optionalKey(Uuid),
  occurrenceId: Uuid,
  title: Schema.NonEmptyString,
  dueDate: CalendarDate,
  assigneeId: Schema.NullOr(Uuid),
});
export type Chore = typeof Chore.Type;
export const ChoreList = Schema.Struct({
  householdId: Uuid,
  version: Schema.Literal(1),
  chores: Schema.Array(Chore),
});
export const ChoreResult = Schema.Struct({
  householdId: Uuid,
  version: Schema.Literal(1),
  receipt: Completion,
});
