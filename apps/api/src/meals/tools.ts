import * as Effect from "effect/Effect";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { ReadMealWeek } from "@nest/contracts/meals";
import { readMealWeek } from "./read.ts";

export function readMealWeekTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read the household's saved Monday–Sunday meal week and exact revision. Supply the Monday as YYYY-MM-DD. All breakfast/lunch/dinner entries are included, even when a slot is hidden in preferences. Empty slots mean no saved meal, not a dietary or availability judgment. This read never creates a plan or adds groceries. Old ideas and removed entries are excluded. Read fresh before changing a week; generated plans still require a separate visible proposal and approval.",
    input: ReadMealWeek,
    execute: (input) =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* readMealWeek(config, { member, token }, input);
      }).pipe(
        Effect.provide(supabaseIdentity(config)),
        Effect.mapError(
          (error) =>
            new CommandFailure({
              code: error.code === "unavailable" ? "unavailable" : "forbidden",
            }),
        ),
      ),
  });
}
