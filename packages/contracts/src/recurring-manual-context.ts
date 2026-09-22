import * as Schema from "effect/Schema";
import { ManualCycleInput } from "./recurring-manual.ts";
import { RecurringDetail } from "./recurring-read.ts";
import { MoneyDetail } from "./money-detail.ts";
const Uuid = ManualCycleInput.fields.ruleId;
export const ManualCycleContext = Schema.Struct({
  version: Schema.Literal(1),
  actorId: Uuid,
  householdId: Uuid,
  approvalId: Uuid,
  input: ManualCycleInput,
  target: RecurringDetail,
  detail: MoneyDetail,
  linked: Schema.Boolean,
}).check(
  Schema.makeFilter(
    (value) =>
      value.target.householdId === value.householdId &&
      value.detail.householdId === value.householdId &&
      value.target.rule.ruleId === value.input.ruleId &&
      value.detail.event.eventId === value.input.sourceEventId,
  ),
);
export type ManualCycleContext = typeof ManualCycleContext.Type;
