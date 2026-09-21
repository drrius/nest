import * as Schema from "effect/Schema";
import { recurringCycle } from "@nest/domain/money";
import { CalendarDate } from "./chores.ts";
import { RecurringConfiguration, RecurringInput } from "./recurring.ts";
import { RecurringCycle } from "./recurring-cycle.ts";
import { MoneyDetail } from "./money-detail.ts";
const Uuid = RecurringInput.fields.ruleId;
export const ManualCycleInput = Schema.Struct({
  ruleId: Uuid,
  expectedRevision: Uuid,
  dueOn: CalendarDate,
  sourceEventId: Uuid,
});
export type ManualCycleInput = typeof ManualCycleInput.Type;
export const SaveManualCycle = Schema.Struct({ operationId: Uuid, input: ManualCycleInput });
export const ExecuteManualCycle = Schema.Struct({ ...SaveManualCycle.fields, approvalId: Uuid });
const sameCycle = Schema.toEquivalence(RecurringCycle);
export const ManualCycleReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  source: Schema.Literal("manual"),
  eventId: Uuid,
  input: ManualCycleInput,
  cycle: RecurringCycle,
  configuration: RecurringConfiguration,
  linkedExpense: MoneyDetail,
}).check(
  Schema.makeFilter((value) => {
    const { input, cycle, configuration } = value;
    if (cycle.dueOn !== input.dueOn || cycle.dueOn < configuration.startDate) return false;
    try {
      return (
        sameCycle(cycle, recurringCycle(configuration.schedule, input.dueOn)) &&
        linkedMatches(value)
      );
    } catch {
      return false;
    }
  }),
);
function linkedMatches(value: {
  actorId: string;
  householdId: string;
  eventId: string;
  input: ManualCycleInput;
  cycle: typeof RecurringCycle.Type;
  linkedExpense: typeof MoneyDetail.Type;
}) {
  const source = value.linkedExpense,
    event = source.event;
  return (
    source.householdId === value.householdId &&
    event.eventId === value.input.sourceEventId &&
    value.eventId === event.eventId &&
    ["expense", "replacement"].includes(event.kind) &&
    source.reversedById === null &&
    source.shares.some((share) => share.memberId === value.actorId) &&
    Schema.is(CalendarDate)(event.occurredOn) &&
    event.occurredOn >= value.cycle.startsOn &&
    event.occurredOn <= value.cycle.through
  );
}
export function canonicalManualCycle(input: ManualCycleInput): ManualCycleInput {
  return {
    ...input,
    ruleId: input.ruleId.toLowerCase(),
    expectedRevision: input.expectedRevision.toLowerCase(),
    sourceEventId: input.sourceEventId.toLowerCase(),
  };
}
