import * as Effect from "effect/Effect";
import { RenewalReminderQuery } from "@nest/contracts/reminders";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { renewalReminderService } from "./service.ts";
export function renewalReminderReadTools(request: Request, config: IdentityConfig) {
  return {
    readRenewalReminder: effectTool({
      description:
        "Read reminder settings for a known household renewal. Null means no settings exist. Settings include explicit recipients, timing, enabled state and the schedule revision. Read the renewal separately for its current revision. Settings are not proof of notification delivery; recipient mute settings apply. Never infer contract cancellation or payment from a reminder.",
      input: RenewalReminderQuery,
      execute: (input) =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* renewalReminderService(config, { member, token }).read(input);
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
