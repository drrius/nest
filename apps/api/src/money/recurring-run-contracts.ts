import * as Schema from "effect/Schema";
import { FixedJobCursor } from "@nest/contracts/recurring-worker";
const Count = Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 25 }));
export const ClaimRun = Schema.Struct({
  runId: Schema.String.check(Schema.isUUID()),
  budget: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 25 })),
});
export const RunClaim = Schema.Struct({
  version: Schema.Literal(1),
  ...ClaimRun.fields,
  after: Schema.NullOr(FixedJobCursor),
  expiresAt: Schema.String.check(Schema.makeFilter((value) => Number.isFinite(Date.parse(value)))),
});
export const RunSummary = Schema.Struct({
  after: Schema.NullOr(FixedJobCursor),
  complete: Schema.Boolean,
  processed: Count,
  failed: Count,
  scanFailure: Schema.NullOr(Schema.Literals(["unavailable", "forbidden", "conflict"])),
}).check(
  Schema.makeFilter(
    (value) =>
      value.failed <= value.processed &&
      (!value.complete || (value.after === null && value.scanFailure === null)),
  ),
);
export const FinishRun = Schema.Struct({ runId: ClaimRun.fields.runId, report: RunSummary });
export const RunFinished = Schema.Struct({ version: Schema.Literal(1), ...FinishRun.fields });
