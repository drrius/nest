import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CheckGrocery, GroceryCheckReceipt } from "@nest/contracts/groceries";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Rows = Schema.Array(
  Schema.Struct({
    actor_id: Uuid,
    household_id: Uuid,
    operation_id: Uuid,
    request: Schema.Struct({
      target: Uuid,
      expected: Schema.String,
      checked: Schema.Boolean,
    }),
    result: GroceryCheckReceipt,
  }),
);

export function recoverCheck(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  command: typeof CheckGrocery.Type,
) {
  return Effect.gen(function* () {
    const query = new URLSearchParams({
      select: "actor_id,household_id,operation_id,request,result",
      actor_id: `eq.${caller.member.userId}`,
      household_id: `eq.${caller.member.householdId}`,
      operation_id: `eq.${command.operationId}`,
      limit: "2",
    });
    const raw = yield* requestJson(
      config,
      caller.token,
      `rest/v1/nest_grocery_check_receipts?${query}`,
    );
    const rows = yield* Schema.decodeUnknownEffect(Rows)(raw, { onExcessProperty: "error" }).pipe(
      Effect.mapError(() => new ApiFailure({ code: "unavailable" })),
    );
    const row = rows[0];
    if (rows.length !== 1 || !row || !matches(row, caller, command))
      return yield* new ApiFailure({ code: "unavailable" });
    return row.result;
  });
}

function matches(
  row: (typeof Rows.Type)[number],
  caller: AuthorizedCaller,
  command: typeof CheckGrocery.Type,
) {
  return (
    row.actor_id === caller.member.userId &&
    row.household_id === caller.member.householdId &&
    row.operation_id === command.operationId &&
    row.request.target === command.itemId &&
    row.request.expected === command.expectedVersion &&
    row.request.checked === command.checked &&
    row.result.operation === command.operationId &&
    row.result.target === command.itemId &&
    row.result.checked === command.checked
  );
}
