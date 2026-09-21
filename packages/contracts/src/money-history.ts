import * as Schema from "effect/Schema";
import { SignedCentimes } from "./money.ts";
import { MoneyDate, MoneyTime, MoneyOrder, compareMoneyOrder } from "./money-time.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const MoneyHistoryQuery = Schema.Struct({ before: Schema.NullOr(Uuid) });
export const MoneyEventSummary = Schema.Struct({
  eventId: Uuid,
  kind: Schema.Literals([
    "opening_balance",
    "expense",
    "refund",
    "settlement",
    "reversal",
    "replacement",
  ]),
  occurredOn: MoneyDate,
  createdAt: MoneyTime,
  occurredOrder: MoneyOrder,
  createdOrder: MoneyOrder,
  description: Schema.NonEmptyString.check(Schema.isMaxLength(400)),
  amountCentimes: SignedCentimes.check(Schema.makeFilter((value) => BigInt(value) >= 0n)),
  createdBy: Uuid,
  payerId: Schema.NullOr(Uuid),
  relatedEventId: Schema.NullOr(Uuid),
  hasReceipt: Schema.Boolean,
}).check(
  Schema.makeFilter(
    (row) =>
      (row.kind === "reversal" ? row.payerId === null : row.payerId !== null) &&
      (["refund", "reversal", "replacement"].includes(row.kind)
        ? row.relatedEventId !== null
        : row.relatedEventId === null),
  ),
);
export const MoneyHistory = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  before: Schema.NullOr(Uuid),
  next: Schema.NullOr(Uuid),
  events: Schema.Array(MoneyEventSummary).check(Schema.isMaxLength(50)),
}).check(
  Schema.makeFilter(
    (page) =>
      new Set(page.events.map((row) => row.eventId)).size === page.events.length &&
      page.events.every(
        (row, index) =>
          row.eventId !== page.before &&
          (index === 0 || historyOrder(page.events[index - 1]!, row) > 0),
      ) &&
      (page.next === null || (page.events.length === 50 && page.next === page.events[49]!.eventId)),
  ),
);
function historyOrder(a: typeof MoneyEventSummary.Type, b: typeof MoneyEventSummary.Type) {
  for (const key of ["occurredOrder", "createdOrder"] as const) {
    if (a[key] !== b[key]) return compareMoneyOrder(a[key], b[key]);
  }
  return a.eventId === b.eventId ? 0 : a.eventId > b.eventId ? 1 : -1;
}
