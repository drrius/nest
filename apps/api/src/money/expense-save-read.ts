import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ExpenseSaveQuery, ExpenseSaveResult } from "@nest/contracts/expense-save-read";
import { ExpenseReceipt } from "@nest/contracts/expense";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
const Rows = Schema.Array(Schema.Struct({ result: ExpenseReceipt })).check(Schema.isMaxLength(1));
export function readExpenseSave(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(ExpenseSaveQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const operationId = query.operationId.toLowerCase();
    const actorId = caller.member.userId,
      householdId = caller.member.householdId;
    const params = new URLSearchParams({
      select: "result",
      actor_id: `eq.${actorId}`,
      household_id: `eq.${householdId}`,
      operation_id: `eq.${operationId}`,
      limit: "2",
    });
    const raw = yield* requestJson(config, caller.token, `rest/v1/nest_expense_receipts?${params}`);
    const rows = yield* Schema.decodeUnknownEffect(Rows)(raw, { onExcessProperty: "error" }).pipe(
      Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
    );
    return yield* Schema.decodeUnknownEffect(ExpenseSaveResult)({
      version: 1,
      actorId,
      householdId,
      operationId,
      receipt: rows[0]?.result ?? null,
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
  });
}
