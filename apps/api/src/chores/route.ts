import * as Effect from "effect/Effect";
import { commandBody } from "../request-body.ts";
import { choreCommands, type AuthorizedCaller } from "./service.ts";
import { changeChore } from "./change.ts";
import type { IdentityConfig } from "../supabase-identity.ts";

export function choreRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname;
    const commands = choreCommands(config, caller);
    if (path === "/v1/chores")
      return { version: 1, householdId: caller.member.householdId, chores: yield* commands.list() };
    const input = yield* commandBody(request, 8192);
    if (path === "/v1/chores/complete")
      return {
        version: 1,
        householdId: caller.member.householdId,
        receipt: yield* commands.complete(input),
      };
    const action = path === "/v1/chores/skip" ? "skip" : "reschedule";
    return { version: 1, receipt: yield* changeChore(config, caller, action, input) };
  });
}
