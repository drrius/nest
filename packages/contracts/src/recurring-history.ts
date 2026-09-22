import * as Schema from "effect/Schema";
import { recurringCycle } from "@nest/domain/money";
import { CalendarDate } from "./chores.ts";
import { MoneyTime } from "./money-time.ts";
import { RecurringConfiguration, RecurringInput } from "./recurring.ts";
import { RecurringCycle } from "./recurring-cycle.ts";
import { ExpenseInput } from "./expense.ts";
const Uuid = RecurringInput.fields.ruleId;
const sameCycle = Schema.toEquivalence(RecurringCycle);
export const RecurringHistoryQuery = Schema.Struct({
  ruleId: Uuid,
  before: Schema.NullOr(CalendarDate),
});
export const RecurringHistoryEntry = Schema.Struct({
  revision: Uuid,
  source: Schema.Literals(["automatic", "variable", "manual"]),
  eventId: Uuid,
  recordedBy: Uuid,
  recordedAt: MoneyTime,
  cycle: RecurringCycle,
  configuration: RecurringConfiguration,
  amountCentimes: ExpenseInput.fields.amountCentimes,
  payerId: Uuid,
}).check(
  Schema.makeFilter((value) => {
    if (value.cycle.dueOn < value.configuration.startDate) return false;
    if (
      value.source === "automatic" &&
      (value.configuration.mode !== "fixed" ||
        value.amountCentimes !== value.configuration.amountCentimes)
    )
      return false;
    if (value.source === "variable" && value.configuration.mode !== "variable") return false;
    if (value.source !== "manual" && value.payerId !== value.configuration.payerId) return false;
    try {
      return sameCycle(
        value.cycle,
        recurringCycle(value.configuration.schedule, value.cycle.dueOn),
      );
    } catch {
      return false;
    }
  }),
);
export const RecurringHistory = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  ...RecurringHistoryQuery.fields,
  next: Schema.NullOr(CalendarDate),
  cycles: Schema.Array(RecurringHistoryEntry).check(Schema.isMaxLength(20)),
}).check(
  Schema.makeFilter(
    (value) =>
      value.cycles.every((row, index) => {
        const before = value.cycles[index - 1]?.cycle.dueOn ?? value.before;
        return before === null || row.cycle.dueOn < before;
      }) &&
      (value.next === null ||
        (value.cycles.length === 20 && value.next === value.cycles.at(-1)?.cycle.dueOn)),
  ),
);
export type RecurringHistory = typeof RecurringHistory.Type;
