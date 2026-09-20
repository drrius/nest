import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { GroceryCategory, GroceryReceipt, Uuid } from "@nest/contracts/groceries";
import type { Account } from "../offline/contracts.ts";
import { GroceryFailure, safe, type GroceryRequest } from "./transport.ts";
import { GroceryChange } from "./edit-contract.ts";

const Categories = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  categories: Schema.Array(GroceryCategory),
});
const Result = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  receipt: GroceryReceipt,
});
export function groceryEditing(request: GroceryRequest, account: Account) {
  return {
    categories: () =>
      request("v1/groceries/categories").pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Categories)),
        Effect.flatMap((result) =>
          result.householdId === account.household &&
          result.categories.length <= 100 &&
          new Set(result.categories.map((row) => row.categoryId)).size === result.categories.length
            ? Effect.succeed(result.categories)
            : Effect.fail(new GroceryFailure({ code: "unavailable" })),
        ),
        Effect.mapError(safe),
      ),
    change: (change: GroceryChange) =>
      Schema.decodeEffect(GroceryChange)(change).pipe(
        Effect.mapError(() => new GroceryFailure({ code: "invalid" })),
        Effect.flatMap(({ action, command }) => request(`v1/groceries/${action}`, command)),
        Effect.flatMap(Schema.decodeUnknownEffect(Result)),
        Effect.flatMap(({ householdId, receipt }) =>
          householdId === account.household &&
          receipt.operation === change.command.operationId &&
          receipt.target === change.command.itemId &&
          receipt.removed === (change.action === "remove")
            ? Effect.succeed(receipt)
            : Effect.fail(new GroceryFailure({ code: "unavailable" })),
        ),
        Effect.mapError(safe),
      ),
  };
}
