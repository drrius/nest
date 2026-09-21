import * as Schema from "effect/Schema";
import { CalendarDate } from "./chores.ts";
import { RecurringConfiguration, RecurringInput } from "./recurring.ts";
import { firstUncoveredRecurringCycle } from "@nest/domain/money";
const Uuid = RecurringInput.fields.ruleId;
export const RecurringResumeInput = Schema.Struct({
  ruleId: Uuid,
  expectedRevision: Uuid,
  expectedStatus: Schema.Literal("paused"),
  action: Schema.Literal("resume"),
  resumeFrom: CalendarDate,
  firstDueOn: CalendarDate,
}).check(Schema.makeFilter((value) => value.firstDueOn >= value.resumeFrom));
export type RecurringResumeInput = typeof RecurringResumeInput.Type;
export const SaveRecurringResume = Schema.Struct({
  operationId: Uuid,
  change: RecurringResumeInput,
});
export const ExecuteRecurringResume = Schema.Struct({
  ...SaveRecurringResume.fields,
  approvalId: Uuid,
});
export const RecurringResumeReceipt = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  operationId: Uuid,
  approvalId: Schema.NullOr(Uuid),
  revision: Uuid,
  status: Schema.Literal("active"),
  change: RecurringResumeInput,
  configuration: RecurringConfiguration,
  coveredThrough: Schema.NullOr(CalendarDate),
}).check(
  Schema.makeFilter((value) => {
    if (
      value.revision === value.change.expectedRevision ||
      value.change.resumeFrom < value.configuration.startDate
    )
      return false;
    const cycle = firstUncoveredRecurringCycle(value.configuration.schedule, {
      from: value.change.resumeFrom,
      coveredThrough: value.coveredThrough,
    });
    return cycle?.dueOn === value.change.firstDueOn;
  }),
);
export function canonicalRecurringResume(input: RecurringResumeInput): RecurringResumeInput {
  return {
    ...input,
    ruleId: input.ruleId.toLowerCase(),
    expectedRevision: input.expectedRevision.toLowerCase(),
  };
}
