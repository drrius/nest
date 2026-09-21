import * as Schema from "effect/Schema";
import { CalendarDate, Chore } from "./chores.ts";

export const CalendarChoreQuery = Schema.Struct({ date: CalendarDate });
export const CalendarChore = Schema.Struct({
  ...Chore.fields,
  routineId: Schema.String.check(Schema.isUUID()),
  role: Schema.Literals(["current", "preview"]),
});
export const CalendarChores = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Schema.String.check(Schema.isUUID()),
  date: CalendarDate,
  chores: Schema.Array(CalendarChore).check(Schema.isMaxLength(200)),
}).check(
  Schema.makeFilter(
    (value) =>
      new Set(value.chores.map((row) => row.occurrenceId)).size === value.chores.length &&
      value.chores.every((row) => row.dueDate === value.date),
  ),
);
