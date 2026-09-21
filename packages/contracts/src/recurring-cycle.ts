import * as Schema from "effect/Schema";
import { recurringCycle } from "@nest/domain/money";
import { CalendarDate } from "./chores.ts";
import { RecurringConfiguration, RecurringInput } from "./recurring.ts";
const Uuid = RecurringInput.fields.ruleId;
export const RecurringCycle = Schema.Struct({
  key: Schema.String,
  dueOn: CalendarDate,
  startsOn: CalendarDate,
  through: CalendarDate,
});
const equivalent = Schema.toEquivalence(RecurringCycle);
export const FixedRecurringCycleReceipt = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  ruleId: Uuid,
  revision: Uuid,
  source: Schema.Literal("automatic"),
  authorizedBy: Uuid,
  eventId: Uuid,
  cycle: RecurringCycle,
  configuration: RecurringConfiguration,
}).check(
  Schema.makeFilter((value) => {
    if (value.configuration.mode !== "fixed" || value.cycle.dueOn < value.configuration.startDate)
      return false;
    try {
      return equivalent(
        value.cycle,
        recurringCycle(value.configuration.schedule, value.cycle.dueOn),
      );
    } catch {
      return false;
    }
  }),
);
