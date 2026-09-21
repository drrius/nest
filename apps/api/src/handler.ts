import { moneyRoute } from "./money/route.ts";
import { mealProposalRoute, type MealPlanningOptions } from "./meal-planning/route.ts";
import { mealRoute } from "./meals/route.ts";
import { routineRoute } from "./routines/route.ts";
import { setupStatus } from "./setup/service.ts";
import { notificationRoute } from "./notifications/route.ts";
import { calendarRoute } from "./calendar/route.ts";
import { memoryRoute } from "./memory/route.ts";
import { foodPreferences } from "./food/service.ts";
import { cookingPreferences } from "./cooking/service.ts";
import { assistantHandler } from "./assistant/handler.ts";
import { groceryCommands } from "./groceries/service.ts";
import { groceryReads } from "./groceries/read.ts";
import * as Effect from "effect/Effect";
import { ApiFailure, failureResponse } from "./errors.ts";
import { bearerToken, currentMember } from "./identity.ts";
import { supabaseIdentity, type IdentityConfig } from "./supabase-identity.ts";
import { choreRoute } from "./chores/route.ts";
import { commandBody } from "./request-body.ts";
import { validateConfig } from "./config.ts";

function route(
  request: Request,
  config: IdentityConfig,
  proposals: ReturnType<typeof mealProposalRoute>,
) {
  return Effect.gen(function* () {
    const member = yield* currentMember(request);
    const path = new URL(request.url).pathname;
    if (path === "/v1/session") return { version: 1, member };
    const token = yield* bearerToken(request);
    const caller = { member, token };
    const handlers: Record<string, () => Effect.Effect<unknown, ApiFailure>> = {
      setup: () => setupStatus(config, caller),
      "notification-preferences": () => notificationRoute(request, config, caller),
      calendar: () => calendarRoute(request, config, caller),
      memories: () => memoryRoute(request, config, caller),
      "cooking-preferences": () => preferenceRoute(request, config, caller),
      "food-preferences": () => preferenceRoute(request, config, caller),
      groceries: () => groceryRoute(request, config, caller),
      meals: () => mealRoute(request, config, caller, proposals),
      routines: () => routineRoute(request, config, caller),
      money: () => moneyRoute(request, config, caller),
    };
    const selected = handlers[path.split("/")[2]!];
    return yield* selected ? selected() : choreRoute(request, config, caller);
  });
}

export function createHandler(config: IdentityConfig, options: MealPlanningOptions = {}) {
  const validated = validateConfig(config);
  const identity = supabaseIdentity(validated);
  const proposals = mealProposalRoute(validated, options);
  const assistant = assistantHandler(validated, options.model, options);
  return (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (
      path === "/v1/assistant/turn" ||
      path === "/v1/assistant/conversation" ||
      path === "/v1/assistant/conversations" ||
      path === "/v1/assistant/interrupt"
    )
      return assistant(request);
    const method = methods[path];
    if (!method) return Promise.resolve(new Response(null, { status: 404 }));
    if (request.method !== method)
      return Promise.resolve(new Response(null, { status: 405, headers: { Allow: method } }));
    const response = route(request, validated, proposals).pipe(
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

const methods: Record<string, string> = {
  "/v1/session": "GET",
  "/v1/money/recurring/rules": "GET",
  "/v1/money/recurring/rule": "GET",
  "/v1/money/recurring/save": "POST",
  "/v1/money/recurring/execute": "POST",
  "/v1/money/approval": "GET",
  "/v1/money/approval/decide": "POST",
  "/v1/money/expense/save": "POST",
  "/v1/money/refund/approval": "GET",
  "/v1/money/refund/approval/decide": "POST",
  "/v1/money/correction/approval": "GET",
  "/v1/money/correction/approval/decide": "POST",
  "/v1/money/correction/receipt": "GET",
  "/v1/money/correction/cancel": "POST",
  "/v1/money/correction/context": "GET",
  "/v1/money/correction/save": "POST",
  "/v1/money/correction/execute": "POST",
  "/v1/money/refund/context": "GET",
  "/v1/money/refund/receipt": "GET",
  "/v1/money/refund/cancel": "POST",
  "/v1/money/refund/save": "POST",
  "/v1/money/refund/execute": "POST",
  "/v1/money/settlement/approval": "GET",
  "/v1/money/settlement/approval/decide": "POST",
  "/v1/money/settlement/receipt": "GET",
  "/v1/money/settlement/cancel": "POST",
  "/v1/money/settlement/save": "POST",
  "/v1/money/settlement/execute": "POST",
  "/v1/money/expense/receipt": "GET",
  "/v1/money/expense/cancel": "POST",
  "/v1/money/expense/execute": "POST",
  "/v1/money/receipt": "GET",
  "/v1/money/receipt/link": "GET",
  "/v1/money/receipt/cleanup": "POST",
  "/v1/money/receipt/uploads": "GET",
  "/v1/money/balance": "GET",
  "/v1/money/history": "GET",
  "/v1/money/detail": "GET",
  "/v1/money/category": "GET",
  "/v1/money/categories": "GET",
  "/v1/meals/week": "GET",
  "/v1/meals/ingredients/read": "POST",
  "/v1/meals/ingredients/add": "POST",
  "/v1/meals/proposal": "GET",
  "/v1/meals/proposal/generate": "POST",
  "/v1/meals/proposal/edit": "POST",
  "/v1/meals/proposal/edit/reserve": "POST",
  "/v1/meals/proposal/edit/recover": "POST",
  "/v1/meals/proposal/reserve": "POST",
  "/v1/meals/proposal/open": "POST",
  "/v1/meals/proposal/approve": "POST",
  "/v1/meals/proposal/recover": "POST",
  "/v1/meals/proposal/discard": "POST",
  "/v1/meals/preparation": "GET",
  "/v1/meals/preparation/create": "POST",
  "/v1/meals/preparation/edit": "POST",
  "/v1/meals/library": "GET",
  "/v1/meals/recipe": "GET",
  "/v1/meals/planned-recipe": "GET",
  "/v1/meals/recipe/place": "POST",
  "/v1/meals/recipe/replace": "POST",
  "/v1/meals/recipe/edit": "POST",
  "/v1/meals/recipe/create": "POST",
  "/v1/meals/recipe/archive": "POST",
  "/v1/meals/place": "POST",
  "/v1/meals/remove": "POST",
  "/v1/meals/move": "POST",
  "/v1/meals/leftovers": "POST",
  "/v1/meals/replace": "POST",
  "/v1/routines": "GET",
  "/v1/routines/roster": "GET",
  "/v1/routines/create": "POST",
  "/v1/routines/edit": "POST",
  "/v1/routines/state": "POST",
  "/v1/setup/status": "GET",
  "/v1/notification-preferences": "GET",
  "/v1/notification-preferences/save": "POST",
  "/v1/calendar/consent": "GET",
  "/v1/calendar/busy": "GET",
  "/v1/calendar/chores": "GET",
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
