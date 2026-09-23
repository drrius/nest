import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type { runPushCycle } from "./cycle.ts";
type Report = Effect.Success<ReturnType<typeof runPushCycle>>;
function response(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}
function authorized(header: string | null, secret: Redacted.Redacted<string>) {
  const expected = `Bearer ${Redacted.value(secret)}`;
  if (header === null || header.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++)
    difference |= header.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}
function summarize(report: Report) {
  const delivery = report.delivery.status === "recorded" ? report.delivery.report.outcomes : [];
  const summary =
    report.summaryDelivery.status === "recorded" ? report.summaryDelivery.report.outcomes : [];
  const receipts = report.receipts.status === "recorded" ? report.receipts.report.outcomes : [];
  const failed =
    delivery.filter((v) => v.status === "failed").length +
    summary.filter((v) => v.status === "failed").length +
    receipts.filter((v) => v.status === "failed").length;
  const healthy =
    Object.values(report).every((phase) => phase.status === "recorded") && failed === 0;
  return response(healthy ? 200 : 503, {
    maintenance: report.maintenance.status,
    delivery: report.delivery.status,
    summaryMaintenance: report.summaryMaintenance.status,
    summaryDelivery: report.summaryDelivery.status,
    receipts: report.receipts.status,
    processed: delivery.length + summary.length,
    polled: receipts.length,
    failed,
    complete: [report.delivery, report.summaryDelivery].every(
      (phase) => phase.status === "recorded" && phase.report.complete,
    ),
  });
}
function emptyBody(request: Request) {
  return Effect.tryPromise(async () => {
    if (request.body === null) return true;
    const reader = request.body.getReader();
    try {
      return (await reader.read()).done === true;
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
  }).pipe(Effect.timeout("2 seconds"));
}
/** Dedicated scheduler secret, no business identifiers or provider data in responses. */
export function createPushSchedulerHandler(
  secret: Redacted.Redacted<string>,
  cycle: () => ReturnType<typeof runPushCycle>,
) {
  if (!/^[a-f0-9]{64}$(?![\s\S])/.test(Redacted.value(secret)))
    throw new Error("Push scheduler requires a separate random 32-byte hexadecimal token");
  return (request: Request) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const url = new URL(request.url);
        if (url.pathname !== "/internal/push/run") return response(404, { error: "not_found" });
        if (request.method !== "POST") return response(405, { error: "method_not_allowed" });
        if (url.search) return response(400, { error: "invalid_request" });
        if (!authorized(request.headers.get("authorization"), secret))
          return response(401, { error: "unauthorized" });
        if (!(yield* emptyBody(request))) return response(400, { error: "invalid_request" });
        return summarize(yield* cycle());
      }).pipe(
        Effect.timeout("90 seconds"),
        Effect.catch(() => Effect.succeed(response(503, { error: "unavailable" }))),
      ),
      { signal: request.signal },
    );
}
