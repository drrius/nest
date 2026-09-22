import * as Schema from "effect/Schema";
import { RecurringSchedule, RecurringInput } from "./recurring.ts";
import { ExpenseInput } from "./expense.ts";
import { CalendarDate } from "./chores.ts";
import { MoneyTime } from "./money-time.ts";
const Uuid = RecurringInput.fields.ruleId;
const Count = Schema.String.check(Schema.isPattern(/^(0|[1-9]\d{0,18})$/));
export const LegacyRecurringQuery = Schema.Struct({ after: Schema.NullOr(Uuid) });
export const LegacyRecurringRule = Schema.Struct({
  ruleId: Uuid,
  mode: Schema.Literal("legacy_draft_only"),
  description: ExpenseInput.fields.description,
  amountCentimes: ExpenseInput.fields.amountCentimes,
  payerId: Uuid,
  allocations: ExpenseInput.fields.allocations,
  categoryId: Schema.NullOr(Uuid),
  active: Schema.Boolean,
  nextOccurrenceOn: CalendarDate,
  updatedAt: MoneyTime,
  schedule: RecurringSchedule,
  drafts: Schema.Struct({
    pending: Count,
    posted: Count,
    dismissed: Count,
    postedWithoutEvent: Count,
    unpostedWithEvent: Count,
    latestDraftOn: Schema.NullOr(CalendarDate),
  }),
}).check(
  Schema.makeFilter((value) => {
    const [first, second] = value.allocations,
      d = value.drafts;
    const total = BigInt(d.pending) + BigInt(d.posted) + BigInt(d.dismissed);
    return (
      first.memberId !== second.memberId &&
      value.allocations.some((a) => a.memberId === value.payerId) &&
      BigInt(first.centimes) + BigInt(second.centimes) === BigInt(value.amountCentimes) &&
      BigInt(d.postedWithoutEvent) <= BigInt(d.posted) &&
      BigInt(d.unpostedWithEvent) <= BigInt(d.pending) + BigInt(d.dismissed) &&
      (total === 0n) === (d.latestDraftOn === null)
    );
  }),
);
export const LegacyRecurringList = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  ...LegacyRecurringQuery.fields,
  next: Schema.NullOr(Uuid),
  rules: Schema.Array(LegacyRecurringRule).check(Schema.isMaxLength(20)),
}).check(
  Schema.makeFilter(
    (value) =>
      value.rules.every(
        (row, index) => row.ruleId > (value.rules[index - 1]?.ruleId ?? value.after ?? ""),
      ) &&
      (value.next === null ||
        (value.rules.length === 20 && value.next === value.rules.at(-1)?.ruleId)),
  ),
);
