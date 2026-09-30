import * as Effect from "effect/Effect";
import type { PushSessionRevocation } from "@nest/contracts/push-registration";
import type { PendingLogoutCredentials } from "../session/pending-logout-credentials.ts";
import { SessionFailure } from "../session/contracts.ts";
import { tokenIdentity } from "../session/token-identity.ts";
const unavailable = () => new SessionFailure({ code: "unavailable" });
interface Dependencies {
  credentials: PendingLogoutCredentials;
  authenticate: Effect.Effect<{ access_token: string; user: { id: string } }, SessionFailure>;
  revoke: (
    fresh: string,
    previous: string,
  ) => Effect.Effect<typeof PushSessionRevocation.Type, SessionFailure>;
}
export function reauthenticatePushLogout(deps: Dependencies) {
  return Effect.gen(function* () {
    const pending = yield* Effect.tryPromise({ try: deps.credentials.read, catch: unavailable });
    if (!pending) return yield* unavailable();
    if (yield* Effect.tryPromise({ try: deps.credentials.completed, catch: unavailable }))
      return pending.access_token;
    const previous = yield* Effect.try({
      try: () => tokenIdentity(pending.access_token),
      catch: unavailable,
    });
    if (pending.user.id.toLowerCase() !== previous.actor) return yield* unavailable();
    const fresh = yield* deps.authenticate;
    const current = yield* Effect.try({
      try: () => tokenIdentity(fresh.access_token),
      catch: unavailable,
    });
    if (fresh.user.id.toLowerCase() !== previous.actor || current.actor !== previous.actor)
      return yield* unavailable();
    const receipt = yield* deps.revoke(fresh.access_token, pending.access_token);
    if (
      receipt.actorId !== previous.actor ||
      receipt.sessionId !== previous.session ||
      !receipt.revoked
    )
      return yield* unavailable();
    yield* Effect.tryPromise({
      try: () => deps.credentials.complete(pending.access_token),
      catch: unavailable,
    });
    return pending.access_token;
  });
}
