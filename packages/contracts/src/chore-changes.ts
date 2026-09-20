import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
const Uuid = Schema.String.check(Schema.isUUID());
const identity = {
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  occurrenceId: Uuid,
  previousDueDate: CalendarDate,
  dueDate: CalendarDate,
};
export const SkipChoreReceipt = Schema.Struct({
  ...identity,
  action: Schema.Literal("skip"),
  status: Schema.Literal("skipped"),
}).check(Schema.makeFilter((receipt) => receipt.dueDate === receipt.previousDueDate));
export const RescheduleChoreReceipt = Schema.Struct({
  ...identity,
  action: Schema.Literal("reschedule"),
  status: Schema.Literal("open"),
}).check(Schema.makeFilter((receipt) => receipt.dueDate !== receipt.previousDueDate));
export const ChoreChangeReceipt = Schema.Union([SkipChoreReceipt, RescheduleChoreReceipt]);
export const ChoreChangeEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  receipt: ChoreChangeReceipt,
});
