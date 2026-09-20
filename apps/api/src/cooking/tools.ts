import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { cookingPreferences } from "./service.ts";

export function readCookingPreferencesTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read household-shared cooking notes and visible meal slots, with their exact revision, before a requested change. Null means setup is unconfirmed. This read contains no private food profiles or calorie goals.",
    input: Schema.Struct({}),
    execute: () =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* cookingPreferences(config, { member, token }).read();
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
