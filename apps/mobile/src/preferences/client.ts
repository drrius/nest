import * as Effect from "effect/Effect";
import type * as Duration from "effect/Duration";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
export class PreferenceFailure extends Schema.TaggedError<PreferenceFailure>()(
  "PreferenceFailure",
  {
    code: Schema.Literals(["session", "forbidden", "conflict", "invalid", "unavailable"]),
  },
) {}
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
const normalize = (error: unknown) => (Schema.is(PreferenceFailure)(error) ? error : unavailable());
const statusFailure = (status: number) =>
  new PreferenceFailure({
    code:
      status === 401
        ? "session"
        : status === 403
          ? "forbidden"
          : status === 409
            ? "conflict"
            : status === 400
              ? "invalid"
              : "unavailable",
  });
export function preferenceRequests(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
  timeout: Duration.Input = "15 seconds",
) {
  return <A>(path: string, schema: Schema.Codec<A>, body?: object) =>
    Effect.gen(function* () {
      const session = yield* credentials.pipe(
        Effect.mapError(
          (error) =>
            new PreferenceFailure({
              code: error.code === "cutover" ? "unavailable" : error.code,
            }),
        ),
      );
      if (session.user.id !== account.actor)
        return yield* new PreferenceFailure({ code: "session" });
      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        "X-Nest-Household": account.household,
      };
      const url = new URL(path, apiUrl);
      const response = yield* body
        ? HttpClient.post(url, { headers, body: yield* HttpBody.json(body) })
        : HttpClient.get(url, { headers });
      if (response.status !== 200) return yield* statusFailure(response.status);
      return yield* response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })),
      );
    }).pipe(
      Effect.timeout(timeout),
      Effect.mapError(normalize),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: "error",
        credentials: "omit",
      }),
    );
}
