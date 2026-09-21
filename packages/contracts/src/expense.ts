import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
import { SignedCentimes } from "./money.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const Text = Schema.String.check(
  Schema.makeFilter((value) => !value.includes("\u0000") && !/[\uD800-\uDFFF]/u.test(value)),
);
const Nonnegative = SignedCentimes.check(Schema.makeFilter((value) => BigInt(value) >= 0n));
const Share = Schema.Struct({ memberId: Uuid, centimes: Nonnegative });
const fields = {
  description: Text.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(200),
    Schema.makeFilter((value) => value.trim().length > 0),
  ),
  amountCentimes: Nonnegative,
  payerId: Uuid,
  allocations: Schema.Tuple([Share, Share]),
  date: CalendarDate,
  note: Schema.NullOr(Text.check(Schema.isMaxLength(8000))),
  categoryId: Schema.NullOr(Uuid),
};
function balanced(input: {
  payerId: string;
  amountCentimes: string;
  allocations: readonly [typeof Share.Type, typeof Share.Type];
}) {
  const [first, second] = input.allocations;
  return (
    first.memberId !== second.memberId &&
    input.allocations.some((share) => share.memberId === input.payerId) &&
    BigInt(first.centimes) + BigInt(second.centimes) === BigInt(input.amountCentimes)
  );
}
// UI split modes produce these exact allocations; approval binds the resulting centimes.
export const ExpenseInput = Schema.Struct(fields).check(Schema.makeFilter(balanced));
export type ExpenseInput = typeof ExpenseInput.Type;
export const SaveExpense = Schema.Struct({ operationId: Uuid, expense: ExpenseInput });
export const ExecuteExpense = Schema.Struct({ ...SaveExpense.fields, approvalId: Uuid });
export const ExpenseReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  eventId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  expense: ExpenseInput,
}).check(
  Schema.makeFilter((value) =>
    value.expense.allocations.some((share) => share.memberId === value.actorId),
  ),
);
export type ExpenseReceipt = typeof ExpenseReceipt.Type;
