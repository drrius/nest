import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { routineRoster } from "./roster.ts";

export function readHouseholdRosterTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read the current bounded household roster for explicitly requested assignment choices, independently of the routine list. Use returned IDs only; ask when a name is ambiguous. This read exposes no private calendar, financial or conversation details and does not assign or transfer work.",
    input: Schema.Struct({}),
    execute: () =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return yield* routineRoster(config, { member, token });
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
