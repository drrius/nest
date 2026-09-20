import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { SessionFailure, VerifiedSession, type Member, type SessionState } from "./contracts.ts";

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

export function sessionVerifier(
  verify: (credentials: Credentials) => Effect.Effect<Member, SessionFailure>,
  publish: (state: SessionState) => void,
) {
  let revision = 0;
  let disposed = false;
  let cached: Member | null = null;
  return {
    invalidate() {
      cached = null;
      revision++;
    },
    dispose() {
      cached = null;
      revision++;
      disposed = true;
    },
    unavailable() {
      if (!disposed)
        publish(
          cached ? { status: "ready", member: cached, offline: true } : { status: "unavailable" },
        );
    },
    update(credentials: Credentials | null) {
      const current = ++revision;
      return Effect.gen(function* () {
        if (disposed || current !== revision) return;
        if (!credentials) {
          cached = null;
          publish({ status: "signed_out" });
          return;
        }
        const previous = cached?.userId === credentials.user.id ? cached : null;
        cached = previous;
        if (!previous) publish({ status: "loading" });
        const state = yield* verify(credentials).pipe(
          Effect.match({
            onSuccess: (member): SessionState => ({ status: "ready", member }),
            onFailure: (error): SessionState =>
              error.code === "unavailable" && previous
                ? { status: "ready", member: previous, offline: true }
                : { status: error.code === "cancelled" ? "signed_out" : error.code },
          }),
        );
        if (!disposed && current === revision) {
          cached = state.status === "ready" ? state.member : null;
          publish(state);
        }
      });
    },
  };
}
