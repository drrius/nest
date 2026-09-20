import * as Effect from "effect/Effect";
import { notificationPreferences } from "./service.ts";
import { commandBody } from "../request-body.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function notificationRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const service = notificationPreferences(config, caller);
    if (new URL(request.url).pathname === "/v1/notification-preferences")
      return {
        version: 1,
        actorId: caller.member.userId,
        householdId: caller.member.householdId,
        timeZone: "Europe/Zurich",
        profile: yield* service.read(),
      };
    return { version: 1, receipt: yield* service.save(yield* commandBody(request, 8192)) };
  });
}
