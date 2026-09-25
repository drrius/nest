import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import { bearerToken, currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import type { ApiFailure } from "../errors.ts";
import { setupStatus } from "./service.ts";
const failure = (error: ApiFailure) =>
  new CommandFailure({ code: error.code === "unavailable" ? "unavailable" : "forbidden" });
export function setupTools(request: Request, config: IdentityConfig) {
  return {
    openAccountSettings: effectTool({
      description:
        "Open your native profile and account settings when you ask to review your account or sign out. Navigation only: does not sign out, remove credentials, change your identity or switch accounts. Open the card and use the explicit native controls. Sign-in requires the native Apple flow and cannot be completed by this assistant.",
      input: Schema.Struct({}),
      execute: () =>
        currentMember(request).pipe(
          Effect.as({ kind: "device_handoff" as const, screen: "settings" as const }),
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(failure),
        ),
    }),
    openNotificationSetup: effectTool({
      description:
        "Open your notification settings on this iPhone to review device permission, enable notifications or remove this device. Navigation only: does not request permission, enroll or remove a token, save preferences, or confirm delivery. The member must open the card and explicitly use the native controls. Never change a partner's settings or claim notifications are enabled from this handoff.",
      input: Schema.Struct({}),
      execute: () =>
        currentMember(request).pipe(
          Effect.as({
            kind: "device_handoff" as const,
            screen: "notification-preferences" as const,
          }),
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(failure),
        ),
    }),
    readSetupStatus: effectTool({
      description:
        "Read whether your own food and notification choices and shared household cooking preferences have been saved. These are configuration facts, not overall setup completion or evidence of iPhone permissions, push delivery or meal readiness. A failed read is unknown. Do not infer consent from missing setup. Every person may skip optional setup and return later.",
      input: Schema.Struct({}),
      execute: () =>
        Effect.gen(function* () {
          const member = yield* currentMember(request),
            token = yield* bearerToken(request);
          return yield* setupStatus(config, { member, token });
        }).pipe(Effect.provide(supabaseIdentity(config)), Effect.mapError(failure)),
    }),
    openSetup: effectTool({
      description:
        "Open native setup when asked to set up everything or continue optional setup. Navigation only: does not save preferences, complete setup or grant any permission. The member may also start quickly from there without changing choices.",
      input: Schema.Struct({}),
      execute: () =>
        currentMember(request).pipe(
          Effect.as({ kind: "device_handoff" as const, screen: "setup" as const }),
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(failure),
        ),
    }),
  };
}
