import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CreateRoutine, RoutineReceipt, Routine } from "@nest/contracts/routines";
import { ApiFailure } from "../errors.ts";
import { requestDocument, requestJson } from "../supabase-request.ts";
import { readHouseholdMembers } from "../household-members.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { RoutineRow, canonicalRoutineVersion, routineAssignment } from "./rows.ts";
const decode = <A>(
  schema: Schema.Codec<A>,
  value: unknown,
  code: ApiFailure["code"] = "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export function routineCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  return {
    list: () => listRoutines(config, caller),
    create: (input: unknown) =>
      Effect.gen(function* () {
        const command = yield* decode(CreateRoutine, input, "invalid_request");
        const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_create_routine", {
          p_household: caller.member.householdId,
          p_operation: command.operationId.toLowerCase(),
          p_definition: command.definition,
        });
        const receipt = yield* decode(RoutineReceipt, raw);
        if (
          receipt.actorId !== caller.member.userId ||
          receipt.householdId !== caller.member.householdId ||
          receipt.operationId !== command.operationId.toLowerCase() ||
          receipt.action !== "create"
        )
          return yield* new ApiFailure({ code: "unavailable" });
        return receipt;
      }),
  };
}
function listRoutines(config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const householdId = caller.member.householdId;
    const params = new URLSearchParams({
      select:
        "id,household_id,title,schedule_rule,assignment_policy,assigned_member_id,rotation_anchor_member_id,paused_at,archived_at,updated_at",
      household_id: `eq.${householdId}`,
      archived_at: "is.null",
      order: "title.asc,id.asc",
      limit: "201",
    });
    const document = yield* requestDocument(config, caller.token, `rest/v1/routines?${params}`);
    const rows = yield* decode(
      Schema.Array(RoutineRow).check(Schema.isMaxLength(200)),
      document.value,
    );
    const range = rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0";
    if (
      document.range !== range ||
      new Set(rows.map((row) => row.id)).size !== rows.length ||
      rows.some((row) => row.household_id !== householdId)
    )
      return yield* new ApiFailure({ code: "unavailable" });
    const members = yield* readHouseholdMembers(config, caller);
    const routines = yield* Effect.forEach(rows, (row) =>
      decode(Routine, {
        routineId: row.id,
        version: canonicalRoutineVersion(row.updated_at),
        definition: {
          title: row.title,
          schedule: row.schedule_rule,
          assignment: routineAssignment(row),
        },
        state: row.paused_at === null ? "active" : "paused",
      }),
    );
    if (
      routines.some((routine) => {
        const assignment = routine.definition.assignment;
        if (assignment.policy === "shared") return false;
        const assignee =
          assignment.policy === "assigned" ? assignment.memberId : assignment.anchorMemberId;
        return !members.some((member) => member.userId === assignee);
      })
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return {
      routines,
      members: members.map((member) => ({
        actorId: member.userId,
        displayName: member.displayName,
      })),
    };
  });
}
