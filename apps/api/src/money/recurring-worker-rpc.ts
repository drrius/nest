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
  scan: "nest_due_fixed_jobs",
  execute: "nest_execute_fixed_job",
  claim: "nest_claim_recurring_run",
  finish: "nest_finish_recurring_run",
};
export function recurringWorkerRpc(config: IdentityConfig, secret: Redacted.Redacted<string>) {
  const validated = validateConfig(config);
  if (!/^sb_secret_[A-Za-z0-9_-]+$(?![\s\S])/.test(Redacted.value(secret)))
    throw new Error("Recurring worker requires a server-only Supabase secret key");
  return (method: keyof typeof methods, input: unknown) =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post(
        new URL(`rest/v1/rpc/${methods[method]}`, validated.url),
        { headers: { apikey: Redacted.value(secret) }, body: yield* HttpBody.json(input) },
      );
      if (response.status === 401 || response.status === 403)
        return yield* new ApiFailure({ code: "forbidden" });
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
      Effect.timeout("10 seconds"),
      Effect.mapError((error) =>
        Schema.is(ApiFailure)(error) ? error : new ApiFailure({ code: "unavailable" }),
      ),
      Effect.provide(FetchHttpClient.layer),
      Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, "apikey"]),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    );
}
