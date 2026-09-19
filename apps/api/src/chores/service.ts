import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import { ApiFailure } from "../errors.ts";
import type { Member } from "../identity.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ChoreRows, CompleteChore, Completion } from "./contracts.ts";

export type AuthorizedCaller = { readonly member: Member; readonly token: string };

function requestJson(config: IdentityConfig, token: string, path: string, body?: unknown) {
  const headers = { apikey: config.publishableKey, Authorization: `Bearer ${token}` };
  return Effect.gen(function* () {
    const url = new URL(path, config.url);
    const response = yield* body === undefined
      ? HttpClient.get(url, { headers })
      : HttpClient.post(url, { headers, body: yield* HttpBody.json(body) });
    if (response.status === 401) return yield* new ApiFailure({ code: "unauthenticated" });
    if (response.status === 403) return yield* new ApiFailure({ code: "forbidden" });
    const value = yield* response.json;
    if (response.status < 200 || response.status >= 300) {
      const error = yield* Schema.decodeUnknownEffect(Schema.Struct({ code: Schema.String }))(
        value,
      );
      const code =
        error.code === "40001"
          ? "conflict"
          : error.code === "22023"
            ? "invalid_request"
            : "unavailable";
      return yield* new ApiFailure({ code });
    }
    return value;
  }).pipe(
    Effect.timeout("10 seconds"),
    Effect.mapError((cause) =>
      Schema.is(ApiFailure)(cause) ? cause : new ApiFailure({ code: "unavailable" }),
    ),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
  );
}

export function choreCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  return {
    list: () =>
      Effect.gen(function* () {
        const query = new URLSearchParams({
          select: "id,household_id,due_date,planned_assignee_id,routines!inner(title)",
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
          assigneeId: row.planned_assignee_id,
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
        const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_complete_chore", {
          p_occurrence_id: command.occurrenceId,
          p_operation_id: command.operationId,
          p_expected_due_date: command.expectedDueDate,
          p_completed_on: command.completedOn,
        });
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
