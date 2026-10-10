import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { ROOT_CONTEXT, SpanKind, SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import {
  AlwaysOnSampler,
  BasicTracerProvider,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";

type Environment = Readonly<Record<string, string | undefined>>;
type LogWriter = (record: Readonly<Record<string, unknown>>) => void;
type RequestTrace = {
  span: Span;
  requestId: string;
  tracer: ReturnType<BasicTracerProvider["getTracer"]>;
};
const requests = new AsyncLocalStorage<RequestTrace>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const parent = /^00-([0-9a-f]{32})-([0-9a-f]{16})-(0[01])$/;
const fields = [
  "request_id",
  "route",
  "method",
  "status",
  "outcome",
  "stage",
  "rpc",
  "code",
  "operation",
  "model",
  "tool",
];

function parentContext(request: Request) {
  const match = parent.exec(request.headers.get("traceparent") ?? "");
  if (!match || /^0+$/.test(match[1]!) || /^0+$/.test(match[2]!)) return ROOT_CONTEXT;
  return trace.setSpanContext(ROOT_CONTEXT, {
    traceId: match[1]!,
    spanId: match[2]!,
    traceFlags: Number(match[3]),
    isRemote: true,
  });
}

function identity(environment: Environment) {
  const build = environment.VERCEL_GIT_COMMIT_SHA;
  const deployment = environment.VERCEL_DEPLOYMENT_ID;
  return {
    service: "nest-api",
    build: build && /^[0-9a-f]{40}$/.test(build) ? build : "local",
    deployment: deployment && /^dpl_[A-Za-z0-9]{1,80}$/.test(deployment) ? deployment : "local",
  };
}

function writeSpan(span: ReadableSpan, write: LogWriter, environment: Environment) {
  const attributes = Object.fromEntries(
    fields.flatMap((key) =>
      span.attributes[key] === undefined ? [] : [[key, span.attributes[key]]],
    ),
  );
  const [seconds, nanos] = span.duration;
  try {
    write({
      event: span.name,
      ...identity(environment),
      ...attributes,
      trace_id: span.spanContext().traceId,
      span_id: span.spanContext().spanId,
      parent_span_id: span.parentSpanContext?.spanId,
      duration_ms: Math.round((seconds * 1000 + nanos / 1e6) * 100) / 100,
    });
  } catch {
    /* Diagnostics must not change a command's result. */
  }
}

function routeCategory(request: Request) {
  const path = new URL(request.url).pathname;
  if (path === "/internal/push/run") return "worker.push";
  if (path === "/internal/recurring/run") return "worker.recurring";
  const money = new Set([
    "balance",
    "history",
    "categories",
    "category",
    "detail",
    "pending-approvals",
  ]);
  const segments = path.split("/");
  if (segments[1] !== "v1") return "unknown";
  if (segments[2] === "money")
    return money.has(segments[3] ?? "") ? `money.${segments[3]}` : "money.other";
  const groups = new Set([
    "session",
    "chores",
    "groceries",
    "meals",
    "calendar",
    "assistant",
    "setup",
    "routines",
    "renewals",
    "food-preferences",
    "cooking-preferences",
    "memories",
    "notification-preferences",
    "member-colours",
    "push-devices",
    "latest-daily-summary",
    "daily-summary",
    "recurring-reminders",
    "grocery-reminders",
    "meal-reminders",
    "chore-reminders",
    "renewal-reminders",
  ]);
  return groups.has(segments[2] ?? "") ? segments[2]! : "unknown";
}

export function observeHandler(
  handler: (request: Request) => Promise<Response>,
  environment: Environment = {},
  write: LogWriter = (record) => process.stdout.write(`${JSON.stringify(record)}\n`),
) {
  const provider = new BasicTracerProvider({
    sampler: new AlwaysOnSampler(),
    spanProcessors: [
      {
        onStart() {},
        onEnd: (span) => writeSpan(span, write, environment),
        forceFlush: () => Promise.resolve(),
        shutdown: () => Promise.resolve(),
      },
    ],
  });
  const tracer = provider.getTracer("nest.api", "1");
  return (request: Request) => {
    const supplied = request.headers.get("X-Nest-Request-ID") ?? "";
    const requestId = uuid.test(supplied) ? supplied.toLowerCase() : randomUUID();
    const span = tracer.startSpan(
      "nest.request",
      {
        kind: SpanKind.SERVER,
        attributes: {
          request_id: requestId,
          route: routeCategory(request),
          method: safeMethod(request.method),
        },
      },
      parentContext(request),
    );
    return requests.run({ span, requestId, tracer }, () => respond(request, handler, span));
  };
}

function safeMethod(method: string) {
  return ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(method)
    ? method
    : "OTHER";
}

async function respond(
  request: Request,
  handler: (request: Request) => Promise<Response>,
  span: Span,
) {
  let ended = false;
  const finish = (outcome: "complete" | "cancelled" | "failed") => {
    if (ended) return;
    ended = true;
    request.signal.removeEventListener("abort", aborted);
    span.setAttribute("outcome", outcome);
    if (outcome === "failed") span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
  };
  const aborted = () => finish("cancelled");
  request.signal.addEventListener("abort", aborted, { once: true });
  try {
    if (request.signal.aborted) aborted();
    const response = await handler(request);
    span.setAttribute("status", response.status);
    if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
    const headers = new Headers(response.headers);
    headers.set("X-Nest-Request-ID", requests.getStore()!.requestId);
    headers.set("traceparent", spanHeader(span));
    const body = response.body ? observedBody(response.body, finish) : null;
    if (!body) finish("complete");
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    span.setAttribute("status", 503);
    finish(request.signal.aborted ? "cancelled" : "failed");
    return new Response(null, {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Nest-Request-ID": requests.getStore()!.requestId,
        traceparent: spanHeader(span),
      },
    });
  }
}

function observedBody(
  body: ReadableStream<Uint8Array>,
  finish: (outcome: "complete" | "cancelled" | "failed") => void,
) {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const result = await reader.read();
          if (result.done) {
            finish("complete");
            controller.close();
          } else controller.enqueue(result.value);
        } catch (error) {
          finish("failed");
          controller.error(error);
        }
      },
      async cancel(reason) {
        finish("cancelled");
        await reader.cancel(reason);
      },
    },
    { highWaterMark: 0 },
  );
}

function spanHeader(span: Span) {
  const value = span.spanContext();
  return `00-${value.traceId}-${value.spanId}-01`;
}

export function backendTrace(path: string) {
  const request = requests.getStore();
  const name = /^rest\/v1\/rpc\/(nest_[a-z0-9_]{1,100})(?:\?|$)/.exec(path)?.[1];
  const rpc = name ?? backendCategory(path);
  const span = request?.tracer.startSpan(
    "nest.supabase",
    {
      kind: SpanKind.CLIENT,
      attributes: { request_id: request.requestId, rpc },
    },
    trace.setSpan(ROOT_CONTEXT, request.span),
  );
  return {
    headers: span ? { traceparent: spanHeader(span), "X-Nest-Request-ID": request!.requestId } : {},
    stage: (value: "transport" | "decode" | "response" | "schema") =>
      span?.setAttribute("stage", value),
    status: (value: number) => span?.setAttribute("status", value),
    code: (value: unknown) => {
      const known = new Set([
        "42501",
        "40001",
        "55P03",
        "55000",
        "P0002",
        "22023",
        "PT409",
        "PT412",
        "PGRST202",
        "PGRST203",
        "PGRST301",
        "PGRST302",
      ]);
      if (typeof value === "string" && known.has(value)) span?.setAttribute("code", value);
    },
    end: (failed: boolean) => {
      if (failed) span?.setStatus({ code: SpanStatusCode.ERROR });
      span?.setAttribute("outcome", failed ? "failed" : "complete");
      span?.end();
    },
  };
}

function backendCategory(path: string) {
  if (path === "auth/v1/user") return "auth.user";
  if (path === "rest/v1/household_members") return "identity.membership";
  return "postgrest";
}

export function diagnosticSpans() {
  const request = requests.getStore();
  return (
    kind: "generation" | "model" | "tool",
    attributes: { operation: string; model: string; tool?: string },
  ) => {
    const span = request?.tracer.startSpan(
      `nest.ai.${kind}`,
      {
        attributes: { ...attributes, request_id: request.requestId },
      },
      trace.setSpan(ROOT_CONTEXT, request.span),
    );
    let ended = false;
    return (outcome: "complete" | "failed" | "cancelled") => {
      if (ended) return;
      ended = true;
      span?.setAttribute("outcome", outcome);
      if (outcome === "failed") span?.setStatus({ code: SpanStatusCode.ERROR });
      span?.end();
    };
  };
}
