import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import { ApiFailure } from "./errors.ts";
import type { IdentityConfig } from "./supabase-identity.ts";

export function requestDocument(
  config: IdentityConfig,
  token: string,
  path: string,
  body?: unknown,
) {
  const headers = { apikey: config.publishableKey, Authorization: `Bearer ${token}` };
  return Effect.gen(function* () {
    const url = new URL(path, config.url);
    const response = yield* body === undefined
      ? HttpClient.get(url, { headers: { ...headers, Prefer: "count=exact" } })
      : HttpClient.post(url, { headers, body: yield* HttpBody.json(body) });
    if (response.status === 401) return yield* new ApiFailure({ code: "unauthenticated" });
    if (response.status === 403) {
      const denied = yield* response.json.pipe(Effect.orElseSucceed(() => null));
      return yield* new ApiFailure({ code: deniedCode(denied) });
    }
    const value = yield* response.json;
    if (response.status < 200 || response.status >= 300) {
      const error = yield* Schema.decodeUnknownEffect(Schema.Struct({ code: Schema.String }))(
        value,
      );
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
  );
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
  if (["40001", "55P03", "55000"].includes(code)) return "conflict";
  if (code === "P0002") return "removed";
  if (code === "22023") return "invalid_request";
  return "unavailable";
}
