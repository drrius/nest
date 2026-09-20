import * as Schema from "effect/Schema";
import { CalendarDate } from "@nest/contracts/chores";
export { CalendarDate, CompleteChore, Completion } from "@nest/contracts/chores";
const Uuid = Schema.String.check(Schema.isUUID());
export const ChoreRows = Schema.Array(
  Schema.Struct({
    id: Uuid,
    household_id: Uuid,
    due_date: CalendarDate,
    nest_accepted_assignee_id: Schema.NullOr(Uuid),
    planned_assignee_id: Schema.NullOr(Uuid),
    routines: Schema.Struct({ title: Schema.NonEmptyString }),
  }),
);
