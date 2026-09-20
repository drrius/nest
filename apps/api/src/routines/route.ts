import * as Effect from "effect/Effect";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { commandBody } from "../request-body.ts";
import { routineCommands } from "./service.ts";
export function routineRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const commands = routineCommands(config, caller);
    if (new URL(request.url).pathname === "/v1/routines")
      return { version: 1, householdId: caller.member.householdId, ...(yield* commands.list()) };
    return { version: 1, receipt: yield* commands.create(yield* commandBody(request, 8192)) };
  });
}
