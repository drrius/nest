import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CalendarChoreQuery, CalendarChores } from "@nest/contracts/calendar-chores";
import { ChoreRows } from "../chores/contracts.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestDocument } from "../supabase-request.ts";
import { decode } from "./codec.ts";

const Uuid = Schema.String.check(Schema.isUUID());
const Rows = Schema.Array(
  Schema.Struct({
    ...ChoreRows.value.fields,
    routine_id: Uuid,
    role: Schema.Literals(["current", "preview"]),
    routines: Schema.Struct({ title: Schema.NonEmptyString, household_id: Uuid }),
  }),
).check(Schema.isMaxLength(200));

export function readCalendarChores(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const { date } = yield* decode(CalendarChoreQuery, input, "invalid_request");
    const householdId = caller.member.householdId;
    const query = new URLSearchParams({
      select:
        "id,household_id,routine_id,role,due_date,planned_assignee_id,nest_accepted_assignee_id,routines!inner(title,household_id)",
      household_id: `eq.${householdId}`,
      due_date: `eq.${date}`,
      status: "eq.open",
      role: "in.(current,preview)",
      "routines.household_id": `eq.${householdId}`,
      "routines.archived_at": "is.null",
      "routines.paused_at": "is.null",
      order: "id.asc",
      limit: "201",
    });
    const document = yield* requestDocument(
      config,
      caller.token,
      `rest/v1/routine_occurrences?${query}`,
    );
    const rows = yield* decode(Rows, document.value);
    const range = rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0";
    if (
      document.range !== range ||
      rows.some(
        (row) => row.household_id !== householdId || row.routines.household_id !== householdId,
      )
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return yield* decode(CalendarChores, {
      version: 1,
      householdId,
      date,
      chores: rows.map((row) => ({
        occurrenceId: row.id,
        routineId: row.routine_id,
        role: row.role,
        title: row.routines.title,
        dueDate: row.due_date,
        assigneeId: row.nest_accepted_assignee_id ?? row.planned_assignee_id,
      })),
    });
  });
}

export function calendarChoreQuery(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.size !== 1 || !params.has("date"))
    return Effect.fail(new ApiFailure({ code: "invalid_request" }));
  return decode(CalendarChoreQuery, { date: params.get("date") }, "invalid_request");
}
