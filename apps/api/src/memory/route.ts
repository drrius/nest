import * as Effect from "effect/Effect";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { commandBody } from "../request-body.ts";
import { memoryReads } from "./read.ts";
import { memoryCommands } from "./commands.ts";
export function memoryRoute(request: Request, config: IdentityConfig, caller: AuthorizedCaller) {
  return Effect.gen(function* () {
    const url = new URL(request.url);
    const envelope = {
      version: 1,
      actorId: caller.member.userId,
      householdId: caller.member.householdId,
    };
    const reads = memoryReads(config, caller);
    if (url.pathname === "/v1/memories") return yield* reads.list();
    if (url.pathname === "/v1/memories/approval")
      return { ...envelope, approval: yield* reads.approval(url.searchParams.get("id") ?? "") };
    const commands = memoryCommands(config, caller);
    const input = yield* commandBody(request);
    if (url.pathname === "/v1/memories/propose")
      return { ...envelope, approval: yield* commands.propose(input) };
    if (url.pathname === "/v1/memories/decide")
      return { ...envelope, decision: yield* commands.decide(input) };
    return { ...envelope, receipt: yield* commands.remove(input) };
  });
}
