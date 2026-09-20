import { groceryRequest, GroceryFailure, safe } from "./transport.ts";
export { GroceryFailure } from "./transport.ts";
import { groceryEditing } from "./editing-client.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  GroceryList,
  GroceryCheckReceipt,
  Uuid,
  type CheckGrocery,
} from "@nest/contracts/groceries";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";

const Result = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  receipt: GroceryCheckReceipt,
});
export function groceryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = groceryRequest(apiUrl, account, credentials);
  return {
    ...groceryEditing(request, account),
    list: () =>
      request("v1/groceries").pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(GroceryList)),
        Effect.flatMap((result) =>
          result.householdId === account.household &&
          result.groceries.length <= 500 &&
          new Set(result.groceries.map((row) => row.itemId)).size === result.groceries.length
            ? Effect.succeed(result.groceries)
            : Effect.fail(new GroceryFailure({ code: "unavailable" })),
        ),
        Effect.mapError(safe),
      ),
    check: (command: typeof CheckGrocery.Type) =>
      request("v1/groceries/check", command).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Result)),
        Effect.flatMap(({ householdId, receipt }) =>
          householdId === account.household &&
          receipt.target === command.itemId &&
          receipt.operation === command.operationId &&
          receipt.checked === command.checked
            ? Effect.succeed(receipt)
            : Effect.fail(new GroceryFailure({ code: "unavailable" })),
        ),
        Effect.mapError(safe),
      ),
  };
}
export type GroceryClient = ReturnType<typeof groceryClient>;
