import * as Schema from "effect/Schema";
import { SaveExpense, ExpenseReceipt } from "./expense.ts";
const Uuid = SaveExpense.fields.operationId;
export const ExpenseSaveQuery = Schema.Struct({ operationId: Uuid });
export const ExpenseSaveResult = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  status: Schema.Literals(["unresolved", "recorded", "cancelled"]),
  receipt: Schema.NullOr(ExpenseReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.receipt === null) return value.status !== "recorded";
    return (
      value.status === "recorded" &&
      value.receipt.approvalId === null &&
      value.receipt.actorId === value.actorId &&
      value.receipt.householdId === value.householdId &&
      value.receipt.operationId === value.operationId
    );
  }),
);
export type ExpenseSaveResult = typeof ExpenseSaveResult.Type;
