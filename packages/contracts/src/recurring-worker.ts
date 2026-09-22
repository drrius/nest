import * as Schema from "effect/Schema";
import { FixedRecurringCycleReceipt, RecurringCycle } from "./recurring-cycle.ts";
const Uuid = Schema.String.check(Schema.isUUID());
export const FixedJobInput = Schema.Struct({
  householdId: Uuid,
  ruleId: Uuid,
  revision: Uuid,
  dueOn: RecurringCycle.fields.dueOn,
});
export const FixedJobCursor = Schema.Struct({
  dueOn: RecurringCycle.fields.dueOn,
  householdId: Uuid,
  ruleId: Uuid,
});
export const FixedJobScan = Schema.Struct({
  limit: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100 })),
  after: Schema.NullOr(FixedJobCursor),
});
export const FixedJobPage = Schema.Struct({
  version: Schema.Literal(1),
  today: RecurringCycle.fields.dueOn,
  after: Schema.NullOr(FixedJobCursor),
  next: Schema.NullOr(FixedJobCursor),
  jobs: Schema.Array(FixedJobInput).check(Schema.isMaxLength(100)),
}).check(
  Schema.makeFilter((value) => {
    const ordered = value.jobs.every((job, index) => {
      const previous = value.jobs[index - 1] ?? value.after;
      return job.dueOn <= value.today && (!previous || cursorKey(job) > cursorKey(previous));
    });
    const last = value.jobs.at(-1);
    return (
      ordered &&
      (value.next === null || (last !== undefined && cursorKey(value.next) === cursorKey(last)))
    );
  }),
);
export const ExecuteFixedJob = Schema.Struct({ jobId: Uuid, input: FixedJobInput });
export const FixedJobResult = Schema.Struct({
  version: Schema.Literal(1),
  jobId: Uuid,
  worker: Schema.Literal("recurring-scheduler"),
  input: FixedJobInput,
  receipt: FixedRecurringCycleReceipt,
}).check(
  Schema.makeFilter(
    (value) =>
      value.input.householdId === value.receipt.householdId &&
      value.input.ruleId === value.receipt.ruleId &&
      value.input.revision === value.receipt.revision &&
      value.input.dueOn === value.receipt.cycle.dueOn,
  ),
);
export type FixedJobInput = typeof FixedJobInput.Type;
export type FixedJobPage = typeof FixedJobPage.Type;
export type FixedJobResult = typeof FixedJobResult.Type;

function cursorKey(value: typeof FixedJobCursor.Type) {
  return `${value.dueOn}:${value.householdId}:${value.ruleId}`;
}
