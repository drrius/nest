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
    if (response.status === 403) return yield* new ApiFailure({ code: "forbidden" });
    const value = yield* response.json;
    if (response.status < 200 || response.status >= 300) {
      const error = yield* Schema.decodeUnknownEffect(Schema.Struct({ code: Schema.String }))(
        value,
      );
      const code = ["40001", "55P03", "55000"].includes(error.code)
        ? "conflict"
        : error.code === "P0002"
          ? "removed"
          : error.code === "22023"
            ? "invalid_request"
            : "unavailable";
      return yield* new ApiFailure({ code });
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
