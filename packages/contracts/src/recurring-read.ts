import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
import { MoneyTime } from "./money-time.ts";
import { RecurringInput, RecurringConfiguration } from "./recurring.ts";
const Uuid = RecurringInput.fields.ruleId;
export const RecurringListQuery = Schema.Struct({ after: Schema.NullOr(Uuid) });
export const RecurringDetailQuery = Schema.Struct({ ruleId: Uuid });
export const RecurringRule = Schema.Struct({
  ruleId: Uuid,
  revision: Uuid,
  configuration: RecurringConfiguration,
  status: Schema.Literals(["active", "paused", "cancelled"]),
  authorizedBy: Uuid,
  authorizedAt: MoneyTime,
  coveredThrough: Schema.NullOr(CalendarDate),
  nextDueOn: Schema.NullOr(CalendarDate),
});
const envelope = { version: Schema.Literal(1), householdId: Uuid, today: CalendarDate };
export const RecurringDetail = Schema.Struct({ ...envelope, rule: RecurringRule });
export const RecurringList = Schema.Struct({
  ...envelope,
  after: Schema.NullOr(Uuid),
  next: Schema.NullOr(Uuid),
  rules: Schema.Array(RecurringRule).check(Schema.isMaxLength(50)),
}).check(
  Schema.makeFilter(
    (value) =>
      value.rules.every(
        (row, index) => row.ruleId > (value.rules[index - 1]?.ruleId ?? value.after ?? ""),
      ) &&
      (value.next === null ||
        (value.rules.length === 50 && value.next === value.rules.at(-1)?.ruleId)),
  ),
);
export type RecurringRule = typeof RecurringRule.Type;
export type RecurringList = typeof RecurringList.Type;
export type RecurringDetail = typeof RecurringDetail.Type;
