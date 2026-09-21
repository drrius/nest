import * as Schema from "effect/Schema";
import { recurringCycle } from "@nest/domain/money";
import { CalendarDate } from "./chores.ts";
import { ExpenseInput } from "./expense.ts";
import { RecurringConfiguration } from "./recurring.ts";
import { RecurringCycle } from "./recurring-cycle.ts";
const Uuid = ExpenseInput.fields.payerId;
export const VariableCycleInput = Schema.Struct({
  ruleId: Uuid,
  expectedRevision: Uuid,
  dueOn: CalendarDate,
  amountCentimes: ExpenseInput.fields.amountCentimes,
  allocations: ExpenseInput.fields.allocations,
}).check(
  Schema.makeFilter(
    (value) =>
      value.allocations[0].memberId.toLowerCase() !== value.allocations[1].memberId.toLowerCase() &&
      BigInt(value.allocations[0].centimes) + BigInt(value.allocations[1].centimes) ===
        BigInt(value.amountCentimes),
  ),
);
export type VariableCycleInput = typeof VariableCycleInput.Type;
export const SaveVariableCycle = Schema.Struct({ operationId: Uuid, input: VariableCycleInput });
export const ExecuteVariableCycle = Schema.Struct({
  ...SaveVariableCycle.fields,
  approvalId: Uuid,
});
const sameCycle = Schema.toEquivalence(RecurringCycle);
const sameExpense = Schema.toEquivalence(ExpenseInput);
export const VariableCycleReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  source: Schema.Literal("variable"),
  eventId: Uuid,
  input: VariableCycleInput,
  cycle: RecurringCycle,
  configuration: RecurringConfiguration,
  expense: ExpenseInput,
}).check(
  Schema.makeFilter((value) => {
    const { configuration, input, cycle } = value;
    if (
      configuration.mode !== "variable" ||
      cycle.dueOn !== input.dueOn ||
      cycle.dueOn < configuration.startDate
    )
      return false;
    return (
      sameCycle(cycle, recurringCycle(configuration.schedule, input.dueOn)) &&
      input.allocations.some((share) => share.memberId === value.actorId) &&
      sameExpense(value.expense, {
        description: configuration.description,
        payerId: configuration.payerId,
        categoryId: configuration.categoryId,
        note: configuration.note,
        date: input.dueOn,
        amountCentimes: input.amountCentimes,
        allocations: input.allocations,
      })
    );
  }),
);
export function canonicalVariableCycle(input: VariableCycleInput): VariableCycleInput {
  return {
    ...input,
    ruleId: input.ruleId.toLowerCase(),
    expectedRevision: input.expectedRevision.toLowerCase(),
    allocations: [
      { ...input.allocations[0], memberId: input.allocations[0].memberId.toLowerCase() },
      { ...input.allocations[1], memberId: input.allocations[1].memberId.toLowerCase() },
    ],
  };
}
