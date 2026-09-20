import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { foodPreferences } from "./service.ts";

export function readFoodPreferencesTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read only the requesting member's private food preferences and exact revision before a requested change. Null means setup is unconfirmed, not no restrictions. Never expose these fields to the partner.",
    input: Schema.Struct({}),
    execute: () =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* foodPreferences(config, { member, token }).read();
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
