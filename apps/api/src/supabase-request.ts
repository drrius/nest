import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as Exit from "effect/Exit";
import { ApiFailure } from "./errors.ts";
import { backendTrace } from "./telemetry.ts";
import type { IdentityConfig } from "./supabase-identity.ts";

export function requestDocument(
  config: IdentityConfig,
  token: string,
  path: string,
  body?: unknown,
) {
  return Effect.suspend(() => {
    const diagnostic = backendTrace(path);
    const headers = {
      apikey: config.publishableKey,
      Authorization: `Bearer ${token}`,
      ...diagnostic.headers,
    };
    diagnostic.stage("transport");
    return Effect.gen(function* () {
      const url = new URL(path, config.url);
      const response = yield* body === undefined
        ? HttpClient.get(url, { headers: { ...headers, Prefer: "count=exact" } })
        : HttpClient.post(url, { headers, body: yield* HttpBody.json(body) });
      diagnostic.status(response.status);
      diagnostic.stage("response");
      if (response.status === 401) return yield* new ApiFailure({ code: "unauthenticated" });
      if (response.status === 403) {
        diagnostic.stage("decode");
        const denied = yield* response.json.pipe(Effect.orElseSucceed(() => null));
        if (Schema.is(Schema.Struct({ code: Schema.String }))(denied)) diagnostic.code(denied.code);
        diagnostic.stage("response");
        return yield* new ApiFailure({ code: deniedCode(denied) });
      }
      diagnostic.stage("decode");
      const value = yield* response.json;
      diagnostic.stage("response");
      if (response.status < 200 || response.status >= 300) {
        const error = yield* Schema.decodeUnknownEffect(Schema.Struct({ code: Schema.String }))(
          value,
        );
        diagnostic.code(error.code);
        if (incompleteHousehold(path, response.status, value))
          return yield* new ApiFailure({ code: "household_incomplete" });
        return yield* new ApiFailure({ code: responseCode(response.status, error.code) });
      }
      return { value, range: response.headers["content-range"] };
    }).pipe(
      Effect.timeout("10 seconds"),
      Effect.mapError((cause) =>
        Schema.is(ApiFailure)(cause) ? cause : new ApiFailure({ code: "unavailable" }),
      ),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
      Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
      Effect.onExit((exit) => Effect.sync(() => diagnostic.end(Exit.isFailure(exit)))),
    );
  });
}

function incompleteHousehold(path: string, status: number, value: unknown) {
  const schema = Schema.Struct({
    code: Schema.Literal("22023"),
    message: Schema.Literal("Money requires two household members"),
  });
  return path === "rest/v1/rpc/nest_money_balance" && status === 400 && Schema.is(schema)(value);
}

export function requestJson(config: IdentityConfig, token: string, path: string, body?: unknown) {
  return requestDocument(config, token, path, body).pipe(Effect.map((document) => document.value));
}

function deniedCode(value: unknown): "unavailable" | "forbidden" {
  const error = Schema.Struct({ code: Schema.String, message: Schema.String });
  // An RPC execute grant failure is service availability, not item-level authorization.
  // Keep domain/RLS denials forbidden and never expose backend error text to clients.
  return Schema.is(error)(value) &&
    value.code === "42501" &&
    /^permission denied for function [^\r\n]+$/.test(value.message)
    ? "unavailable"
    : "forbidden";
}

function responseCode(status: number, code: string): ApiFailure["code"] {
  if (status === 409 && code === "PT409") return "cutover";
  if (status === 412 && code === "PT412") return "conflict";
  if (["40001", "55P03", "55000"].includes(code)) return "conflict";
  if (code === "P0002") return "removed";
  if (code === "22023") return "invalid_request";
  return "unavailable";
}
