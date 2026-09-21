import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Redacted from "effect/Redacted";
import * as Headers from "effect/unstable/http/Headers";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import { ApiFailure } from "../errors.ts";
import { validateConfig } from "../config.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
const methods = {
  context: "nest_meal_planning_context",
  claim: "nest_claim_meal_proposal",
  finish: "nest_finish_meal_proposal",
  editClaim: "nest_claim_proposal_edit",
  editFinish: "nest_finish_proposal_edit",
};
// Server-only capability. Callers must derive actor/household from verified identity.
export function planningServerRpc(config: IdentityConfig, secret: Redacted.Redacted<string>) {
  const validated = validateConfig(config);
  if (!/^sb_secret_[A-Za-z0-9_-]+$(?![\s\S])/.test(Redacted.value(secret)))
    throw new Error("Meal planning requires a server-only Supabase secret key");
  return (method: keyof typeof methods, input: unknown) =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post(
        new URL(`rest/v1/rpc/${methods[method]}`, validated.url),
        {
          headers: { apikey: Redacted.value(secret) },
          body: yield* HttpBody.json(input),
        },
      );
      if (response.status === 403) return yield* new ApiFailure({ code: "forbidden" });
      if (response.status < 200 || response.status >= 300) {
        const error = yield* Schema.decodeUnknownEffect(Schema.Struct({ code: Schema.String }))(
          yield* response.json,
        );
        return yield* new ApiFailure({
          code: ["40001", "55P03", "55000"].includes(error.code) ? "conflict" : "unavailable",
        });
      }
      return yield* response.json;
    }).pipe(
      Effect.timeout("15 seconds"),
      Effect.mapError((error) =>
        Schema.is(ApiFailure)(error) ? error : new ApiFailure({ code: "unavailable" }),
      ),
      Effect.provide(FetchHttpClient.layer),
      Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, "apikey"]),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    );
}
