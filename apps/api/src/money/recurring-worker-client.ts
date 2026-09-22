import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  FixedJobScan,
  FixedJobPage,
  ExecuteFixedJob,
  FixedJobResult,
  FixedJobInput,
  FixedJobCursor,
} from "@nest/contracts/recurring-worker";
import type { recurringWorkerRpc } from "./recurring-worker-rpc.ts";
import { ApiFailure } from "../errors.ts";
const sameInput = Schema.toEquivalence(FixedJobInput),
  sameCursor = Schema.toEquivalence(Schema.NullOr(FixedJobCursor));
const decode = <A>(
  schema: Schema.Codec<A>,
  input: unknown,
  code: "invalid_request" | "unavailable",
) =>
  Schema.decodeUnknownEffect(schema)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new ApiFailure({ code })),
  );
export function recurringWorkerClient(rpc: ReturnType<typeof recurringWorkerRpc>) {
  return {
    scan: (input: typeof FixedJobScan.Type) =>
      Effect.gen(function* () {
        const query = yield* decode(FixedJobScan, input, "invalid_request");
        const page = yield* decode(
          FixedJobPage,
          yield* rpc("scan", { p_limit: query.limit, p_after: query.after }),
          "unavailable",
        );
        if (page.jobs.length > query.limit || !sameCursor(page.after, query.after))
          return yield* new ApiFailure({ code: "unavailable" });
        return page;
      }),
    execute: (input: typeof ExecuteFixedJob.Type) =>
      Effect.gen(function* () {
        const command = yield* decode(ExecuteFixedJob, input, "invalid_request");
        const result = yield* decode(
          FixedJobResult,
          yield* rpc("execute", { p_job: command.jobId, p_input: command.input }),
          "unavailable",
        );
        if (result.jobId !== command.jobId || !sameInput(result.input, command.input))
          return yield* new ApiFailure({ code: "unavailable" });
        return result;
      }),
  };
}
export type RecurringWorkerClient = ReturnType<typeof recurringWorkerClient>;
