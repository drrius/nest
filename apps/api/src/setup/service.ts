import * as Effect from "effect/Effect";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { foodPreferences } from "../food/service.ts";
import { cookingPreferences } from "../cooking/service.ts";
import { notificationPreferences } from "../notifications/service.ts";
export function setupStatus(config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.all(
    {
      food: foodPreferences(config, caller).read(),
      cooking: cookingPreferences(config, caller).read(),
      notifications: notificationPreferences(config, caller).read(),
    },
    { concurrency: 3 },
  ).pipe(
    Effect.map(({ food, cooking, notifications }) => ({
      version: 1 as const,
      actorId: caller.member.userId,
      householdId: caller.member.householdId,
      foodConfigured: food !== null,
      cookingConfigured: cooking !== null,
      notificationsConfigured: notifications !== null,
    })),
  );
}
