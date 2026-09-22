import * as Effect from "effect/Effect";
import type { ClaimRun } from "./recurring-run-contracts.ts";
import type { recurringCheckpointClient } from "./recurring-checkpoint-client.ts";
import type { RecurringWorkerClient } from "./recurring-worker-client.ts";
import { runRecurringJobs } from "./recurring-worker-runner.ts";
/** A timed-out invocation resumes from the last durable checkpoint after lease expiry. */
export function runScheduledRecurring(
  checkpoint: ReturnType<typeof recurringCheckpointClient>,
  worker: RecurringWorkerClient,
  input: typeof ClaimRun.Type,
) {
  return Effect.gen(function* () {
    const claim = yield* checkpoint.claim(input);
    const result = yield* runRecurringJobs(worker, { budget: claim.budget, after: claim.after });
    const report = {
      after: result.after,
      complete: result.complete,
      processed: result.outcomes.length,
      failed: result.outcomes.filter((outcome) => outcome.failure !== null).length,
      scanFailure:
        result.scanFailure === null
          ? null
          : result.scanFailure === "forbidden" || result.scanFailure === "conflict"
            ? result.scanFailure
            : ("unavailable" as const),
    };
    return yield* checkpoint.finish({ runId: claim.runId, report });
  });
}
