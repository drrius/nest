import { foodPreferences } from "./food/service.ts";
import { assistantHandler } from "./assistant/handler.ts";
import type { AssistantModel } from "@nest/ai/chat";
import { groceryCommands } from "./groceries/service.ts";
import { groceryReads } from "./groceries/read.ts";
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
    if (path === "/v1/food-preferences")
      return {
        version: 1,
        actorId: member.userId,
        householdId: member.householdId,
        profile: yield* foodPreferences(config, { member, token }).read(),
      };
    if (path === "/v1/food-preferences/save")
      return {
        version: 1,
        receipt: yield* foodPreferences(config, { member, token }).save(
          yield* commandBody(request, 65536),
        ),
      };
    if (path.startsWith("/v1/groceries"))
      return yield* groceryRoute(request, config, { member, token });
    const commands = choreCommands(config, { member, token });
    if (path === "/v1/chores")
      return { version: 1, householdId: member.householdId, chores: yield* commands.list() };
    return {
      version: 1,
      householdId: member.householdId,
      receipt: yield* commands.complete(yield* commandBody(request)),
    };
  });
}

export function createHandler(config: IdentityConfig, options: { model?: AssistantModel } = {}) {
  const validated = validateConfig(config);
  const identity = supabaseIdentity(validated);
  const assistant = assistantHandler(validated, options.model);
  return (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (
      path === "/v1/assistant/turn" ||
      path === "/v1/assistant/conversation" ||
      path === "/v1/assistant/conversations" ||
      path === "/v1/assistant/interrupt"
    )
      return assistant(request);
    const methods: Record<string, string> = {
      "/v1/session": "GET",
      "/v1/food-preferences": "GET",
      "/v1/food-preferences/save": "POST",
      "/v1/chores": "GET",
      "/v1/chores/complete": "POST",
      "/v1/groceries": "GET",
      "/v1/groceries/categories": "GET",
      "/v1/groceries/add": "POST",
      "/v1/groceries/edit": "POST",
      "/v1/groceries/remove": "POST",
      "/v1/groceries/check": "POST",
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

function groceryRoute(
  request: Request,
  config: IdentityConfig,
  caller: Parameters<typeof groceryCommands>[1],
) {
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname;
    const envelope = { version: 1, householdId: caller.member.householdId };
    const reads = groceryReads(config, caller);
    if (path === "/v1/groceries") return { ...envelope, groceries: yield* reads.list() };
    if (path === "/v1/groceries/categories")
      return { ...envelope, categories: yield* reads.categories() };
    const commands = groceryCommands(config, caller);
    const actions: Record<string, (input: unknown) => Effect.Effect<unknown, ApiFailure>> = {
      "/v1/groceries/add": commands.add,
      "/v1/groceries/edit": commands.edit,
      "/v1/groceries/remove": commands.remove,
      "/v1/groceries/check": commands.check,
    };
    return { ...envelope, receipt: yield* actions[path]!(yield* commandBody(request)) };
  });
}
