import * as Schema from "effect/Schema";
import { ExecuteExpense, ExpenseInput, ExpenseReceipt } from "./expense.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/),
  Schema.makeFilter((value) => Number.isFinite(Date.parse(value))),
);
const equivalent = Schema.toEquivalence(ExpenseInput);
export const ExpenseApprovalQuery = Schema.Struct({ approvalId: Uuid });
export const DecideExpense = Schema.Struct({ ...ExecuteExpense.fields, approved: Schema.Boolean });
export const ExpenseApproval = Schema.Struct({
  id: Uuid,
  operationId: Uuid,
  expense: ExpenseInput,
  status: Schema.Literals(["pending", "approved", "denied", "consumed"]),
  expiresAt: Timestamp,
  receipt: Schema.NullOr(ExpenseReceipt),
}).check(
  Schema.makeFilter((value) => {
    if (value.status !== "consumed") return value.receipt === null;
    return (
      value.receipt !== null &&
      value.receipt.operationId === value.operationId &&
      value.receipt.approvalId === value.id &&
      equivalent(value.receipt.expense, value.expense)
    );
  }),
);
export const ExpenseApprovalEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approval: ExpenseApproval,
}).check(
  Schema.makeFilter(
    (value) =>
      value.approval.expense.allocations.some((share) => share.memberId === value.actorId) &&
      (value.approval.receipt === null ||
        (value.approval.receipt.actorId === value.actorId &&
          value.approval.receipt.householdId === value.householdId)),
  ),
);
export type ExpenseApprovalEnvelope = typeof ExpenseApprovalEnvelope.Type;
