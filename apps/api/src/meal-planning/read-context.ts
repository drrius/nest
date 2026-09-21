import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Headers from "effect/unstable/http/Headers";
import * as Schema from "effect/Schema";
import * as Redacted from "effect/Redacted";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import { ApiFailure } from "../errors.ts";
import { currentMember } from "../identity.ts";
import { validateConfig } from "../config.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";
import { MealPlanningContext } from "./context-schema.ts";

// Internal generation service only. Never register this reader as a route or chat tool.
export function mealPlanningContextReader(
  config: IdentityConfig,
  secret: Redacted.Redacted<string>,
) {
  const validated = validateConfig(config);
  if (!/^sb_secret_[A-Za-z0-9_-]+$(?![\s\S])/.test(Redacted.value(secret)))
    throw new Error("Meal planning requires a server-only Supabase secret key");
  const url = new URL("rest/v1/rpc/nest_meal_planning_context", validated.url);
  return (request: Request) =>
    Effect.gen(function* () {
      const member = yield* currentMember(request);
      const response = yield* HttpClient.post(url, {
        headers: { apikey: Redacted.value(secret) },
        body: yield* HttpBody.json({ p_actor: member.userId, p_household: member.householdId }),
      });
      if (response.status === 403) return yield* new ApiFailure({ code: "forbidden" });
      if (response.status < 200 || response.status >= 300)
        return yield* new ApiFailure({ code: "unavailable" });
      const context = yield* Schema.decodeUnknownEffect(MealPlanningContext)(yield* response.json, {
        onExcessProperty: "error",
      });
      if (context.actorId !== member.userId || context.householdId !== member.householdId)
        return yield* new ApiFailure({ code: "unavailable" });
      return context;
    }).pipe(
      Effect.timeout("15 seconds"),
      Effect.mapError((error) =>
        Schema.is(ApiFailure)(error) ? error : new ApiFailure({ code: "unavailable" }),
      ),
      Effect.provide(Layer.merge(supabaseIdentity(validated), FetchHttpClient.layer)),
      Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, "apikey"]),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    );
}
