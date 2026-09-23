import * as Effect from "effect/Effect";
import { MealReminderQuery } from "@nest/contracts/meal-reminders";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { mealReminderService } from "./service.ts";
export function mealReminderReadTools(request: Request, config: IdentityConfig) {
  return {
    readMealReminder: effectTool({
      description:
        "Read a current saved meal and its reminder settings. Use readMealWeek to find the exact meal entry. The response includes the current itemRevision and nullable reminder revision; use both for saves. Old settings may refer to an older itemRevision and are not proof of delivery. Settings apply only to this meal entry, not future repeats. Recipient mute preferences apply.",
      input: MealReminderQuery,
      execute: (input) =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* mealReminderService(config, { member, token }).read(input);
        }).pipe(
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(
            (error) =>
              new CommandFailure({
                code: error.code === "unavailable" ? "unavailable" : "forbidden",
              }),
          ),
        ),
    }),
  };
}
