import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { routineCommands } from "./service.ts";

export function readRoutinesTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read active and paused household routines, their exact versions and current household member IDs for requested routine actions. Archived routines are excluded. This list contains no private calendar or conversation details.",
    input: Schema.Struct({}),
    execute: () =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* routineCommands(config, { member, token }).list();
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
