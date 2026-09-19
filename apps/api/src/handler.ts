import * as Effect from "effect/Effect";
import { ApiFailure, failureResponse } from "./errors.ts";
import { currentMember } from "./identity.ts";
import { supabaseIdentity, type IdentityConfig } from "./supabase-identity.ts";

export function createHandler(config: IdentityConfig) {
  const base = new URL(config.url);
  if (
    base.protocol !== "https:" &&
    !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))
  ) {
    throw new Error("Supabase URL must use HTTPS or local development HTTP");
  }
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("Supabase URL must be an origin without credentials");
  }
  if (!config.publishableKey.startsWith("sb_publishable_")) {
    throw new Error("Use a Supabase publishable key, never a server secret");
  }
  const identity = supabaseIdentity({ ...config, url: base.href });
  return (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (path !== "/v1/session") return Promise.resolve(new Response(null, { status: 404 }));
    if (request.method !== "GET")
      return Promise.resolve(new Response(null, { status: 405, headers: { Allow: "GET" } }));
    const response = currentMember(request).pipe(
      Effect.map((member) =>
        Response.json({ version: 1, member }, { headers: { "Cache-Control": "no-store" } }),
      ),
      Effect.catchTag("ApiFailure", (error) => Effect.succeed(failureResponse(error))),
      Effect.provide(identity),
    );
    return Effect.runPromise(response, { signal: request.signal }).catch(() =>
      failureResponse(new ApiFailure({ code: "unavailable" })),
    );
  };
}
