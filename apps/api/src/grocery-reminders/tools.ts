import * as Effect from "effect/Effect";
import { GroceryReminderQuery } from "@nest/contracts/grocery-reminders";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { groceryReminderService } from "./service.ts";
export function groceryReminderReadTools(request: Request, config: IdentityConfig) {
  return {
    readGroceryReminder: effectTool({
      description:
        "Read an unchecked grocery item and its reminder settings. Use grocery reads to find the exact itemId. The current itemVersion and nullable reminder revision bind later changes. Reminder timing is an explicit localDate and HH:MM Europe/Zurich localTime; groceries have no implicit due date. Old settings may refer to an older itemVersion and do not prove delivery. Recipient mute preferences apply; checking, changing or removing the item invalidates its reminder.",
      input: GroceryReminderQuery,
      execute: (input) =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* groceryReminderService(config, { member, token }).read(input);
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
