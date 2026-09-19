import * as Effect from "effect/Effect";
import { ApiFailure, failureResponse } from "./errors.ts";
import { bearerToken, currentMember } from "./identity.ts";
import { supabaseIdentity, type IdentityConfig } from "./supabase-identity.ts";
import { choreCommands } from "./chores/service.ts";
import { commandBody } from "./request-body.ts";
import { validateConfig } from "./config.ts";

function route(request: Request, config: IdentityConfig) {
  return Effect.gen(function* () {
    const member = yield* currentMember(request);
    const path = new URL(request.url).pathname;
    if (path === "/v1/session") return { version: 1, member };
    const token = yield* bearerToken(request);
    const commands = choreCommands(config, { member, token });
    if (path === "/v1/chores") return { version: 1, chores: yield* commands.list() };
    return { version: 1, receipt: yield* commands.complete(yield* commandBody(request)) };
  });
}

export function createHandler(config: IdentityConfig) {
  const validated = validateConfig(config);
  const identity = supabaseIdentity(validated);
  return (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const methods: Record<string, string> = {
      "/v1/session": "GET",
      "/v1/chores": "GET",
      "/v1/chores/complete": "POST",
    };
    const method = methods[path];
    if (!method) return Promise.resolve(new Response(null, { status: 404 }));
    if (request.method !== method)
      return Promise.resolve(new Response(null, { status: 405, headers: { Allow: method } }));
    const response = route(request, validated).pipe(
      Effect.map((body) => Response.json(body, { headers: { "Cache-Control": "no-store" } })),
      Effect.catchTag("ApiFailure", (error) => Effect.succeed(failureResponse(error))),
      Effect.provide(identity),
    );
    return Effect.runPromise(response, { signal: request.signal }).catch(() =>
      failureResponse(new ApiFailure({ code: "unavailable" })),
    );
  };
}
