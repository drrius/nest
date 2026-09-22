import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type { IdentityConfig } from "../supabase-identity.ts";
import { recurringWorkerRpc } from "./recurring-worker-rpc.ts";
import { recurringWorkerClient } from "./recurring-worker-client.ts";
import { recurringCheckpointClient } from "./recurring-checkpoint-client.ts";
import { runScheduledRecurring } from "./recurring-scheduled-run.ts";

function response(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
function authorized(header: string | null, secret: Redacted.Redacted<string>) {
  return Effect.sync(() => {
    const expected = `Bearer ${Redacted.value(secret)}`;
    if (header === null || header.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index++)
      difference |= header.charCodeAt(index) ^ expected.charCodeAt(index);
    return difference === 0;
  });
}
/** Dedicated server entry point; never mount this with user or mobile credentials. */
export function createRecurringScheduler(
  config: IdentityConfig,
  workerSecret: Redacted.Redacted<string>,
  schedulerSecret: Redacted.Redacted<string>,
) {
  if (!/^[a-f0-9]{64}$(?![\s\S])/.test(Redacted.value(schedulerSecret)))
    throw new Error("Scheduler requires a separate random 32-byte hexadecimal token");
  const rpc = recurringWorkerRpc(config, workerSecret);
  const worker = recurringWorkerClient(rpc),
    checkpoint = recurringCheckpointClient(rpc);
  return (request: Request) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const url = new URL(request.url);
        if (url.pathname !== "/internal/recurring/run")
          return response(404, { error: "not_found" });
        if (request.method !== "GET") return response(405, { error: "method_not_allowed" });
        if (url.search || request.body !== null) return response(400, { error: "invalid_request" });
        if (!(yield* authorized(request.headers.get("authorization"), schedulerSecret)))
          return response(401, { error: "unauthorized" });
        const completed = yield* runScheduledRecurring(checkpoint, worker, {
          runId: crypto.randomUUID(),
          budget: 5,
        });
        const { processed, failed, complete, scanFailure } = completed.report;
        return response(failed > 0 || scanFailure !== null ? 503 : 200, {
          runId: completed.runId,
          processed,
          failed,
          complete,
          scanFailure,
        });
      }).pipe(
        Effect.timeout("90 seconds"),
        Effect.catch((error) =>
          Effect.succeed(
            response("code" in error && error.code === "conflict" ? 409 : 503, {
              error:
                "code" in error && error.code === "conflict"
                  ? "worker_busy_or_expired"
                  : "unavailable",
            }),
          ),
        ),
      ),
      { signal: request.signal },
    );
}
