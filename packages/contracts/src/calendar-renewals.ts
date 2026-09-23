import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
import { Renewal } from "./renewals.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const CalendarRenewalQuery = Schema.Struct({
  date: CalendarDate,
  after: Schema.NullOr(Uuid),
});
export const CalendarRenewals = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  date: CalendarDate,
  after: Schema.NullOr(Uuid),
  next: Schema.NullOr(Uuid),
  renewals: Schema.Array(Renewal).check(Schema.isMaxLength(50)),
}).check(
  Schema.makeFilter((value) => {
    let previous = value.after ?? "";
    for (const renewal of value.renewals) {
      if (
        renewal.removed ||
        renewal.renewalId <= previous ||
        (renewal.fields.renewalOn !== value.date && renewal.cancellationOn !== value.date)
      )
        return false;
      previous = renewal.renewalId;
    }
    return value.next === null || (value.renewals.length === 50 && value.next === previous);
  }),
);
