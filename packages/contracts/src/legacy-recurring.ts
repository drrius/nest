import * as Schema from "effect/Schema";
import { RecurringSchedule, RecurringInput } from "./recurring.ts";
import { ExpenseInput } from "./expense.ts";
import { CalendarDate } from "./chores.ts";
import { MoneyTime } from "./money-time.ts";
const Uuid = RecurringInput.fields.ruleId;
const Count = Schema.String.check(Schema.isPattern(/^(0|[1-9]\d{0,18})$/));
const Unsupported = Schema.Struct({
  kind: Schema.Literal("unsupported"),
  reason: Schema.Literals(["non_finite", "out_of_range"]),
  value: Schema.NonEmptyString.check(Schema.isMaxLength(80)),
});
export const LegacyRecurringDate = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("date"), value: CalendarDate }),
  Unsupported,
]);
export const LegacyRecurringVersion = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("timestamp"), value: MoneyTime }),
  Unsupported,
]);
export const LegacyRecurringSplit = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("valid"), shares: ExpenseInput.fields.allocations }),
  Schema.Struct({ kind: Schema.Literal("needs_review"), reason: Schema.Literal("invalid_split") }),
]);
export const LegacyRecurringQuery = Schema.Struct({ after: Schema.NullOr(Uuid) });
export const LegacyRecurringRule = Schema.Struct({
  ruleId: Uuid,
  mode: Schema.Literal("legacy_draft_only"),
  description: ExpenseInput.fields.description,
  amountCentimes: ExpenseInput.fields.amountCentimes,
  payerId: Uuid,
  allocations: LegacyRecurringSplit,
  categoryId: Schema.NullOr(Uuid),
  active: Schema.Boolean,
  nextOccurrenceOn: LegacyRecurringDate,
  updatedAt: LegacyRecurringVersion,
  schedule: RecurringSchedule,
  drafts: Schema.Struct({
    pending: Count,
    posted: Count,
    dismissed: Count,
    postedWithoutEvent: Count,
    unpostedWithEvent: Count,
    unsupportedDates: Count,
    latestDraftOn: Schema.NullOr(LegacyRecurringDate),
  }),
}).check(
  Schema.makeFilter((value) => {
    const d = value.drafts;
    const total = BigInt(d.pending) + BigInt(d.posted) + BigInt(d.dismissed);
    return (
      validSplit(value) &&
      BigInt(d.postedWithoutEvent) <= BigInt(d.posted) &&
      BigInt(d.unpostedWithEvent) <= BigInt(d.pending) + BigInt(d.dismissed) &&
      BigInt(d.unsupportedDates) <= total &&
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

function validSplit(value: {
  allocations: typeof LegacyRecurringSplit.Type;
  amountCentimes: string;
  payerId: string;
}) {
  if (value.allocations.kind === "needs_review") return true;
  const [first, second] = value.allocations.shares;
  return (
    first.memberId !== second.memberId &&
    value.allocations.shares.some((a) => a.memberId === value.payerId) &&
    BigInt(first.centimes) + BigInt(second.centimes) === BigInt(value.amountCentimes)
  );
}
