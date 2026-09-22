import * as Effect from "effect/Effect";
import type { PushSessionRevocation } from "@nest/contracts/push-registration";
import type { StoredSession } from "../session/protected-session-record.ts";
import type { PendingLogoutCredentials } from "../session/pending-logout-credentials.ts";
import { SessionFailure } from "../session/contracts.ts";

interface Dependencies {
  credentials: PendingLogoutCredentials;
  refresh: (refreshToken: string) => Effect.Effect<typeof StoredSession.Type, SessionFailure>;
  revoke: (accessToken: string) => Effect.Effect<typeof PushSessionRevocation.Type, SessionFailure>;
  now: () => number;
}
const unavailable = () => new SessionFailure({ code: "unavailable" });
export function pushLogoutCleanup(deps: Dependencies) {
  return Effect.gen(function* () {
    const current = yield* Effect.tryPromise({ try: deps.credentials.read, catch: unavailable });
    if (!current) return null;
    let token = current.access_token;
    if (current.expires_at <= deps.now() + 30) {
      const replacement = yield* deps.refresh(current.refresh_token);
      yield* Effect.tryPromise({
        try: () => deps.credentials.replace(current, replacement),
        catch: unavailable,
      });
      token = replacement.access_token;
    }
    yield* deps.revoke(token);
    return token;
  });
}
