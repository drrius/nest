import * as Effect from "effect/Effect";
import { memberColours } from "./service.ts";
import { commandBody } from "../request-body.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
export function memberColourRoute(
  request: Request,
  config: IdentityConfig,
  caller: AuthorizedCaller,
) {
  return Effect.gen(function* () {
    const service = memberColours(config, caller);
    if (new URL(request.url).pathname === "/v1/member-colours")
      return {
        version: 1,
        actorId: caller.member.userId,
        householdId: caller.member.householdId,
        colours: yield* service.read(),
      };
    return { version: 1, receipt: yield* service.save(yield* commandBody(request, 4096)) };
  });
}
