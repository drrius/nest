import * as Effect from "effect/Effect";
import { ChoreReminderQuery } from "@nest/contracts/chore-reminders";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { choreReminderService } from "./service.ts";
export function choreReminderReadTools(request: Request, config: IdentityConfig) {
  return {
    readChoreReminder: effectTool({
      description:
        "Read a current open chore occurrence and its reminder settings. Use listChores to find the exact occurrence. The response includes the current itemRevision and nullable reminder revision; use both for saves. Old settings may refer to an older itemRevision and are not proof of delivery. Settings apply only to this occurrence, not future repeats. Recipient mute preferences apply.",
      input: ChoreReminderQuery,
      execute: (input) =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* choreReminderService(config, { member, token }).read(input);
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
