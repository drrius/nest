import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  RecurringListQuery,
  RecurringDetailQuery,
  RecurringList,
  DueVariableRules,
  RecurringDetail,
} from "@nest/contracts/recurring-read";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
const invalid = () => new ApiFailure({ code: "invalid_request" });
const unavailable = () => new ApiFailure({ code: "unavailable" });
export function recurringReads(config: IdentityConfig, caller: AuthorizedCaller) {
  return {
    list: (input: unknown) => listRecurring(config, caller, input, false),
    dueVariable: (input: unknown) => listRecurring(config, caller, input, true),
    detail: (input: unknown) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(RecurringDetailQuery)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(invalid));
        const ruleId = query.ruleId.toLowerCase();
        const raw = yield* requestJson(
          config,
          caller.token,
          "rest/v1/rpc/nest_read_recurring_rule",
          { p_household: caller.member.householdId, p_rule: ruleId },
        );
        const result = yield* Schema.decodeUnknownEffect(RecurringDetail)(raw, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(unavailable));
        if (result.householdId !== caller.member.householdId || result.rule.ruleId !== ruleId)
          return yield* unavailable();
        return result;
      }),
  };
}

function listRecurring(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
  dueOnly: boolean,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(RecurringListQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(invalid));
    const after = query.after?.toLowerCase() ?? null;
    const raw = yield* requestJson(
      config,
      caller.token,
      dueOnly
        ? "rest/v1/rpc/nest_read_due_variable_rules"
        : "rest/v1/rpc/nest_read_recurring_rules",
      { p_household: caller.member.householdId, p_after: after },
    );
    const result = yield* Schema.decodeUnknownEffect(dueOnly ? DueVariableRules : RecurringList)(
      raw,
      {
        onExcessProperty: "error",
      },
    ).pipe(Effect.mapError(unavailable));
    if (result.householdId !== caller.member.householdId || result.after !== after)
      return yield* unavailable();
    return result;
  });
}
