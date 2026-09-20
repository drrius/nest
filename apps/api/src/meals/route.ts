import * as Effect from "effect/Effect";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { commandBody } from "../request-body.ts";
import { mealWeekRoute } from "./read.ts";
import { placeMeal } from "./placement.ts";
import { moveMeal } from "./move.ts";
import { removeMeal } from "./removal.ts";
export function mealRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  if (new URL(request.url).pathname === "/v1/meals/week")
    return mealWeekRoute(request, config, caller);
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname;
    const command =
      path === "/v1/meals/move" ? moveMeal : path === "/v1/meals/remove" ? removeMeal : placeMeal;
    const receipt = yield* command(config, caller, yield* commandBody(request));
    return { version: 1, receipt };
  });
}
