import * as Effect from "effect/Effect";
import { readHouseholdMembers } from "../household-members.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function routineRoster(config: IdentityConfig, caller: AuthorizedCaller) {
  return readHouseholdMembers(config, caller).pipe(
    Effect.map((members) => ({
      version: 1 as const,
      householdId: caller.member.householdId,
      members: members.map((member) => ({
        actorId: member.userId,
        displayName: member.displayName,
      })),
    })),
  );
}
