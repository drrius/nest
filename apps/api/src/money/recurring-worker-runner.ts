import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { FixedJobCursor, type FixedJobInput } from "@nest/contracts/recurring-worker";
import type { RecurringWorkerClient } from "./recurring-worker-client.ts";
import { ApiFailure } from "../errors.ts";
export const RecurringRunInput = Schema.Struct({
  budget: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 25 })),
  after: Schema.NullOr(FixedJobCursor),
});
type Cursor = typeof FixedJobCursor.Type;
export interface JobOutcome {
  jobId: string;
  input: FixedJobInput;
  eventId: string | null;
  failure: ApiFailure["code"] | null;
}
export interface RecurringRunReport {
  outcomes: JobOutcome[];
  after: Cursor | null;
  complete: boolean;
  scanFailure: ApiFailure["code"] | null;
}
/** UUIDv8 identifies the same immutable mandate/cycle across process restarts. */
export function fixedJobId(input: FixedJobInput) {
  return Effect.tryPromise({
    try: () =>
      crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(
          `nest:fixed-job:v1:${input.householdId}:${input.ruleId}:${input.revision}:${input.dueOn}`,
        ),
      ),
    catch: () => new ApiFailure({ code: "unavailable" }),
  }).pipe(
    Effect.map((digest) => {
      const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32)
        .split("");
      hex[12] = "8";
      hex[16] = ((parseInt(hex[16]!, 16) & 3) | 8).toString(16);
      const value = hex.join("");
      return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
    }),
  );
}
export function runRecurringJobs(
  client: RecurringWorkerClient,
  input: typeof RecurringRunInput.Type,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(RecurringRunInput)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const report: RecurringRunReport = {
      outcomes: [],
      after: query.after,
      complete: false,
      scanFailure: null,
    };
    while (report.outcomes.length < query.budget) {
      const page = yield* client
        .scan({ limit: Math.min(10, query.budget - report.outcomes.length), after: report.after })
        .pipe(
          Effect.match({ onFailure: (error) => ({ error }), onSuccess: (value) => ({ value }) }),
        );
      if ("error" in page) {
        report.scanFailure = page.error.code;
        return report;
      }
      if (page.value.jobs.length === 0) {
        report.after = null;
        report.complete = true;
        return report;
      }
      for (const job of page.value.jobs) {
        const result = yield* execute(client, job);
        report.outcomes.push(result);
        report.after = { householdId: job.householdId, ruleId: job.ruleId, dueOn: job.dueOn };
      }
    }
    return report;
  });
}
function execute(client: RecurringWorkerClient, input: FixedJobInput) {
  return Effect.gen(function* () {
    const jobId = yield* fixedJobId(input);
    return yield* client.execute({ jobId, input }).pipe(
      Effect.match({
        onFailure: (error): JobOutcome => ({ jobId, input, eventId: null, failure: error.code }),
        onSuccess: (result): JobOutcome => ({
          jobId,
          input,
          eventId: result.receipt.eventId,
          failure: null,
        }),
      }),
    );
  });
}
