import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CommandFailure, effectTool } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import type { ApiFailure } from "../errors.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { validateConfig } from "../config.ts";
import { choreCommands } from "./service.ts";
import { CompleteChore } from "./contracts.ts";

function toolFailure(error: ApiFailure) {
  const code =
    error.code === "conflict"
      ? "conflict"
      : error.code === "unavailable"
        ? "unavailable"
        : "forbidden";
  return new CommandFailure({ code });
}

// Every invocation re-verifies membership; tools cannot supply an actor or household.
export function choreTools(request: Request, config: IdentityConfig) {
  const validated = validateConfig(config);
  const authorized = Effect.gen(function* () {
    const member = yield* currentMember(request);
    const token = yield* bearerToken(request);
    return choreCommands(validated, { member, token });
  }).pipe(Effect.provide(supabaseIdentity(validated)));
  return {
    listChores: effectTool({
      description:
        "Read the current household chores and their due dates before proposing completion.",
      input: Schema.Struct({}),
      execute: () =>
        authorized.pipe(
          Effect.flatMap((commands) => commands.list()),
          Effect.mapError(toolFailure),
        ),
    }),
    completeChore: effectTool({
      description:
        "Complete a chore the member asked to finish. Use its exact occurrence ID and due date, an operation UUID retained for retries, and the member's completion date. Does not affect money.",
      input: CompleteChore,
      execute: (input) =>
        authorized.pipe(
          Effect.flatMap((commands) => commands.complete(input)),
          Effect.mapError(toolFailure),
        ),
    }),
  };
}
