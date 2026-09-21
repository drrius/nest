import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
import { ExpenseInput } from "./expense.ts";
const Uuid = ExpenseInput.fields.payerId;
const ordinal = (maximum: number) => Schema.Int.check(Schema.isBetween({ minimum: 1, maximum }));
export const RecurringSchedule = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("weekly"), weekday: ordinal(7) }),
  Schema.Struct({ kind: Schema.Literal("monthly"), dayOfMonth: ordinal(31) }),
]);
const common = {
  description: ExpenseInput.fields.description,
  payerId: Uuid,
  categoryId: ExpenseInput.fields.categoryId,
  note: ExpenseInput.fields.note,
  startDate: CalendarDate,
  schedule: RecurringSchedule,
};
const Fixed = Schema.Struct({
  ...common,
  mode: Schema.Literal("fixed"),
  amountCentimes: ExpenseInput.fields.amountCentimes,
  allocations: ExpenseInput.fields.allocations,
}).check(
  Schema.makeFilter((value) =>
    Schema.is(ExpenseInput)({
      description: value.description,
      payerId: value.payerId,
      categoryId: value.categoryId,
      note: value.note,
      date: value.startDate,
      amountCentimes: value.amountCentimes,
      allocations: value.allocations,
    }),
  ),
);
// Variable bills authorize reminders/drafts only; amount and split are confirmed per cycle.
const Variable = Schema.Struct({
  ...common,
  mode: Schema.Literal("variable"),
  amountCentimes: Schema.Null,
  allocations: Schema.Null,
});
export const RecurringConfiguration = Schema.Union([Fixed, Variable]);
export type RecurringConfiguration = typeof RecurringConfiguration.Type;
export const RecurringInput = Schema.Struct({
  ruleId: Uuid,
  expectedRevision: Schema.NullOr(Uuid),
  configuration: RecurringConfiguration,
  firstDueOn: CalendarDate,
});
export const SaveRecurring = Schema.Struct({ operationId: Uuid, rule: RecurringInput });
export const ExecuteRecurring = Schema.Struct({ ...SaveRecurring.fields, approvalId: Uuid });
export const RecurringReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  revision: Uuid,
  status: Schema.Literals(["active", "paused"]),
  rule: RecurringInput,
});
export type RecurringInput = typeof RecurringInput.Type;
export type RecurringReceipt = typeof RecurringReceipt.Type;
