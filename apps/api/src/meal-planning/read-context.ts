import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as Redacted from "effect/Redacted";
import { ApiFailure } from "../errors.ts";
import { currentMember, type Member } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { MealPlanningContext } from "./context-schema.ts";
import { planningServerRpc } from "./server-rpc.ts";
export function readPlanningContext(rpc: ReturnType<typeof planningServerRpc>, member: Member) {
  return Effect.gen(function* () {
    const raw = yield* rpc("context", { p_actor: member.userId, p_household: member.householdId });
    const context = yield* Schema.decodeUnknownEffect(MealPlanningContext)(raw, {
      onExcessProperty: "error",
    });
    if (context.actorId !== member.userId || context.householdId !== member.householdId)
      return yield* new ApiFailure({ code: "unavailable" });
    return context;
  }).pipe(
    Effect.mapError((error) =>
      Schema.is(ApiFailure)(error) ? error : new ApiFailure({ code: "unavailable" }),
    ),
  );
}
// Internal only. Never register raw context as a route or chat tool.
export function mealPlanningContextReader(
  config: IdentityConfig,
  secret: Redacted.Redacted<string>,
) {
  const rpc = planningServerRpc(config, secret);
  return (request: Request) =>
    Effect.gen(function* () {
      return yield* readPlanningContext(rpc, yield* currentMember(request));
    }).pipe(Effect.provide(supabaseIdentity(config)));
}
