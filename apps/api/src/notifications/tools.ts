import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { notificationPreferences } from "./service.ts";

export function readNotificationPreferencesTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read only the requesting member's notification choices and revision. Null means unconfigured, never consent. Daily summary time is Europe/Zurich. Settings do not prove OS permission, device enrollment or delivery. Read before changes and preserve all unspecified fields.",
    input: Schema.Struct({}),
    execute: () =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* notificationPreferences(config, { member, token }).read();
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
