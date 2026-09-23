import * as Effect from "effect/Effect";
import { RecurringReminderQuery } from "@nest/contracts/recurring-reminders";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { recurringReminderService } from "./service.ts";
export function recurringReminderReadTools(request: Request, config: IdentityConfig) {
  return {
    readRecurringReminder: effectTool({
      description:
        "Read a recurring financial rule and its reminder settings. Find ruleId with recurring-rule reads. Saving reminder settings requires the current rule revision, nextDueOn and nullable reminder revision. Timing is daysBefore at HH:MM Europe/Zurich. Recipient mute preferences apply. Reminder changes never approve an expense, change a financial mandate or post to the ledger. Read results do not prove notification delivery.",
      input: RecurringReminderQuery,
      execute: (input) =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* recurringReminderService(config, { member, token }).read(input);
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
