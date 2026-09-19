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
export const ChoreRows = Schema.Array(
  Schema.Struct({
    id: Uuid,
    household_id: Uuid,
    due_date: CalendarDate,
    planned_assignee_id: Schema.NullOr(Uuid),
    routines: Schema.Struct({ title: Schema.NonEmptyString }),
  }),
);
