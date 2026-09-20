import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { SessionFailure, VerifiedSession } from "./contracts.ts";

export interface Credentials {
  readonly access_token: string;
  readonly user: { readonly id: string };
}

export function verifySession(apiUrl: string, credentials: Credentials) {
  return Effect.gen(function* () {
    const response = yield* HttpClient.get(new URL("v1/session", apiUrl), {
      headers: { Authorization: `Bearer ${credentials.access_token}` },
    });
    if (response.status === 401) return yield* new SessionFailure({ code: "signed_out" });
    if (response.status === 403) return yield* new SessionFailure({ code: "not_a_member" });
    if (response.status !== 200) return yield* new SessionFailure({ code: "unavailable" });
    const result = yield* Schema.decodeUnknownEffect(VerifiedSession)(yield* response.json);
    if (result.member.userId !== credentials.user.id)
      return yield* new SessionFailure({ code: "unavailable" });
    return result.member;
  }).pipe(
    Effect.timeout("10 seconds"),
    Effect.mapError((error) =>
      Schema.is(SessionFailure)(error) ? error : new SessionFailure({ code: "unavailable" }),
    ),
    Effect.provide(FetchHttpClient.layer),
    Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
  );
}

export { sessionVerifier } from "./offline-verifier.ts";
