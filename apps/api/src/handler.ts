import { mealRoute } from "./meals/route.ts";
import { routineRoute } from "./routines/route.ts";
import { setupStatus } from "./setup/service.ts";
import { notificationRoute } from "./notifications/route.ts";
import { calendarRoute } from "./calendar/route.ts";
import { memoryRoute } from "./memory/route.ts";
import { foodPreferences } from "./food/service.ts";
import { cookingPreferences } from "./cooking/service.ts";
import { assistantHandler } from "./assistant/handler.ts";
import type { AssistantModel } from "@nest/ai/chat";
import { groceryCommands } from "./groceries/service.ts";
import { groceryReads } from "./groceries/read.ts";
import * as Effect from "effect/Effect";
import { ApiFailure, failureResponse } from "./errors.ts";
import { bearerToken, currentMember } from "./identity.ts";
import { supabaseIdentity, type IdentityConfig } from "./supabase-identity.ts";
import { choreRoute } from "./chores/route.ts";
import { commandBody } from "./request-body.ts";
import { validateConfig } from "./config.ts";

function route(request: Request, config: IdentityConfig) {
  return Effect.gen(function* () {
    const member = yield* currentMember(request);
    const path = new URL(request.url).pathname;
    if (path === "/v1/session") return { version: 1, member };
    const token = yield* bearerToken(request);
    if (path === "/v1/setup/status") return yield* setupStatus(config, { member, token });
    if (path.startsWith("/v1/notification-preferences"))
      return yield* notificationRoute(request, config, { member, token });
    if (path.startsWith("/v1/calendar/"))
      return yield* calendarRoute(request, config, { member, token });
    if (path.startsWith("/v1/memories"))
      return yield* memoryRoute(request, config, { member, token });
    if (
      ["/v1/cooking-preferences", "/v1/food-preferences"].some((prefix) => path.startsWith(prefix))
    )
      return yield* preferenceRoute(request, config, { member, token });
    if (path.startsWith("/v1/groceries"))
      return yield* groceryRoute(request, config, { member, token });
    if (path.startsWith("/v1/meals/")) return yield* mealRoute(request, config, { member, token });
    if (path.startsWith("/v1/routines"))
      return yield* routineRoute(request, config, { member, token });
    return yield* choreRoute(request, config, { member, token });
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
      "/v1/meals/week": "GET",
      "/v1/meals/library": "GET",
      "/v1/meals/recipe": "GET",
      "/v1/meals/recipe/create": "POST",
      "/v1/meals/recipe/archive": "POST",
      "/v1/meals/place": "POST",
      "/v1/meals/remove": "POST",
      "/v1/meals/move": "POST",
      "/v1/meals/replace": "POST",
      "/v1/routines": "GET",
      "/v1/routines/create": "POST",
      "/v1/routines/edit": "POST",
      "/v1/routines/state": "POST",
      "/v1/setup/status": "GET",
      "/v1/notification-preferences": "GET",
      "/v1/notification-preferences/save": "POST",
      "/v1/calendar/consent": "GET",
      "/v1/calendar/busy": "GET",
      "/v1/calendar/consent/set": "POST",
      "/v1/calendar/capture": "POST",
      "/v1/calendar/publish": "POST",
      "/v1/memories": "GET",
      "/v1/memories/approval": "GET",
      "/v1/memories/propose": "POST",
      "/v1/memories/decide": "POST",
      "/v1/memories/remove": "POST",
      "/v1/cooking-preferences": "GET",
      "/v1/cooking-preferences/save": "POST",
      "/v1/food-preferences": "GET",
      "/v1/food-preferences/save": "POST",
      "/v1/chores": "GET",
      "/v1/chores/snapshot": "GET",
      "/v1/chores/transfers": "GET",
      "/v1/chores/transfers/request": "POST",
      "/v1/chores/transfers/respond": "POST",
      "/v1/chores/complete": "POST",
      "/v1/chores/skip": "POST",
      "/v1/chores/reschedule": "POST",
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

function preferenceRoute(
  request: Request,
  config: IdentityConfig,
  caller: Parameters<typeof foodPreferences>[1],
) {
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname;
    const { member, token } = caller;
    if (path === "/v1/cooking-preferences")
      return {
        version: 1,
        householdId: member.householdId,
        profile: yield* cookingPreferences(config, { member, token }).read(),
      };
    if (path === "/v1/cooking-preferences/save")
      return {
        version: 1,
        receipt: yield* cookingPreferences(config, { member, token }).save(
          yield* commandBody(request, 16384),
        ),
      };
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
  });
}
