import { recoverCompletion } from "./receipt-recovery.ts";
import { requestJson } from "../supabase-request.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ApiFailure } from "../errors.ts";
import type { Member } from "../identity.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ChoreRows, CompleteChore, Completion } from "./contracts.ts";

export type AuthorizedCaller = { readonly member: Member; readonly token: string };

export function choreCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  return {
    list: () =>
      Effect.gen(function* () {
        const query = new URLSearchParams({
          select:
            "id,household_id,due_date,planned_assignee_id,nest_accepted_assignee_id,routines!inner(title)",
          household_id: `eq.${caller.member.householdId}`,
          status: "eq.open",
          role: "eq.current",
          "routines.archived_at": "is.null",
          "routines.paused_at": "is.null",
          order: "due_date.asc,id.asc",
          limit: "201",
        });
        const raw = yield* requestJson(
          config,
          caller.token,
          `rest/v1/routine_occurrences?${query}`,
        );
        const rows = yield* Schema.decodeUnknownEffect(ChoreRows)(raw).pipe(
          Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
        );
        if (
          rows.length > 200 ||
          rows.some((row) => row.household_id !== caller.member.householdId)
        ) {
          return yield* new ApiFailure({ code: "unavailable" });
        }
        return rows.map((row) => ({
          occurrenceId: row.id,
          title: row.routines.title,
          dueDate: row.due_date,
          assigneeId: row.nest_accepted_assignee_id ?? row.planned_assignee_id,
        }));
      }),
    complete: (input: unknown) =>
      Effect.gen(function* () {
        const decoded = yield* Schema.decodeUnknownEffect(CompleteChore)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
        const command = {
          ...decoded,
          operationId: decoded.operationId.toLowerCase(),
          occurrenceId: decoded.occurrenceId.toLowerCase(),
        };
        const attempt = yield* requestJson(
          config,
          caller.token,
          "rest/v1/rpc/nest_complete_chore_at_epoch",
          {
            p_epoch: command.offlineEpoch ?? null,
            p_command: {
              occurrenceId: command.occurrenceId,
              operationId: command.operationId,
              expectedDueDate: command.expectedDueDate,
              completedOn: command.completedOn,
            },
          },
        ).pipe(Effect.result);
        if (attempt._tag === "Failure") {
          if (attempt.failure.code !== "unavailable") return yield* attempt.failure;
          return yield* recoverCompletion(config, caller, command);
        }
        const raw = attempt.success;
        const receipt = yield* Schema.decodeUnknownEffect(Completion)(raw).pipe(
          Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
        );
        if (
          receipt.operationId !== command.operationId ||
          receipt.occurrenceId !== command.occurrenceId
        ) {
          return yield* new ApiFailure({ code: "unavailable" });
        }
        return receipt;
      }),
  };
}
