import { recurringApprovalClient } from "./recurring-approval-client.ts";
import * as Effect from "effect/Effect";
import { recurringRecoveryClient } from "./recurring-recovery-client.ts";
import * as Schema from "effect/Schema";
import {
  SaveRecurring,
  RecurringInput,
  RecurringReceipt,
  canonicalRecurring,
} from "@nest/contracts/recurring";
import {
  RecurringListQuery,
  RecurringDetailQuery,
  RecurringList,
  RecurringDetail,
} from "@nest/contracts/recurring-read";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type RecurringSave = typeof SaveRecurring.Type;
const equivalent = Schema.toEquivalence(RecurringInput);
const invalid = () => new PreferenceFailure({ code: "invalid" });
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
export function recurringClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    ...recurringApprovalClient(apiUrl, account, credentials),
    ...recurringRecoveryClient(apiUrl, account, credentials),
    recurringRules: (after: string | null = null) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(RecurringListQuery)({ after }).pipe(
          Effect.mapError(invalid),
        );
        const cursor = query.after?.toLowerCase() ?? null,
          params = new URLSearchParams();
        if (cursor !== null) params.set("after", cursor);
        const result = yield* request(`v1/money/recurring/rules?${params}`, RecurringList);
        if (result.householdId !== account.household || result.after !== cursor)
          return yield* unavailable();
        return result;
      }),
    recurringRule: (ruleId: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(RecurringDetailQuery)({ ruleId }).pipe(
          Effect.mapError(invalid),
        );
        const target = query.ruleId.toLowerCase();
        const result = yield* request(
          `v1/money/recurring/rule?${new URLSearchParams({ ruleId: target })}`,
          RecurringDetail,
        );
        if (result.householdId !== account.household || result.rule.ruleId !== target)
          return yield* unavailable();
        return result;
      }),
    saveRecurring: (input: RecurringSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveRecurring)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(invalid));
        const operationId = command.operationId.toLowerCase(),
          rule = canonicalRecurring(command.rule);
        const result = yield* request("v1/money/recurring/save", RecurringReceipt, {
          operationId,
          rule,
        });
        if (
          result.actorId !== account.actor ||
          result.householdId !== account.household ||
          result.operationId !== operationId ||
          result.approvalId !== null ||
          !equivalent(result.rule, rule)
        )
          return yield* unavailable();
        return result;
      }),
  };
}
