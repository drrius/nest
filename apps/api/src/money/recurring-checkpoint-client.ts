import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ClaimRun,
  RunClaim,
  FinishRun,
  RunFinished,
  RunSummary,
} from "./recurring-run-contracts.ts";
import type { recurringWorkerRpc } from "./recurring-worker-rpc.ts";
import { ApiFailure } from "../errors.ts";
const sameReport = Schema.toEquivalence(RunSummary);
function decode<A>(
  schema: Schema.Codec<A>,
  input: unknown,
  code: "invalid_request" | "unavailable",
) {
  return Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
}
export function recurringCheckpointClient(rpc: ReturnType<typeof recurringWorkerRpc>) {
  return {
    claim: (input: typeof ClaimRun.Type) =>
      Effect.gen(function* () {
        const query = yield* decode(ClaimRun, input, "invalid_request");
        const claim = yield* decode(
          RunClaim,
          yield* rpc("claim", { p_run: query.runId, p_budget: query.budget }),
          "unavailable",
        );
        if (claim.runId !== query.runId || claim.budget !== query.budget)
          return yield* new ApiFailure({ code: "unavailable" });
        return claim;
      }),
    finish: (input: typeof FinishRun.Type) =>
      Effect.gen(function* () {
        const query = yield* decode(FinishRun, input, "invalid_request");
        const result = yield* decode(
          RunFinished,
          yield* rpc("finish", { p_run: query.runId, p_report: query.report }),
          "unavailable",
        );
        if (result.runId !== query.runId || !sameReport(result.report, query.report))
          return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
  };
}
