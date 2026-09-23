import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const SummaryCount = Schema.Struct({
  count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
  more: Schema.Boolean,
}).check(Schema.makeFilter((value) => !value.more || value.count === 1000));
export const DailySummary = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  recipientId: Uuid,
  date: CalendarDate,
  choresDue: SummaryCount,
  choresOverdue: SummaryCount,
  mealsPlanned: SummaryCount,
  renewalsDue: SummaryCount,
  cancellationDeadlines: SummaryCount,
});
export const DailySummarySnapshot = Schema.Struct({
  version: Schema.Literal(1),
  summaryId: Uuid,
  summary: DailySummary,
});
