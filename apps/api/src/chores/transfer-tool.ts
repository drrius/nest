import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { choreSnapshot } from "./snapshot.ts";

export function readChoreTransfersTool(request: Request, config: IdentityConfig) {
  return effectTool({
    description:
      "Read current chores, effective responsibility, pending handover requests and household member IDs in one snapshot. actorId identifies the requesting member. Only the responsible member can request a one-turn handover, and only its named recipient can accept or decline. Requesting alone never changes responsibility. Read fresh before acting; do not infer consent from another member's request.",
    input: Schema.Struct({}),
    execute: () =>
      Effect.gen(function* () {
        const member = yield* currentMember(request),
          token = yield* bearerToken(request);
        return { actorId: member.userId, ...(yield* choreSnapshot(config, { member, token })) };
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
