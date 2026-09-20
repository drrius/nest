import * as Effect from "effect/Effect";
import type { Member, SessionFailure, SessionState } from "./contracts.ts";
import type { Credentials } from "./verification.ts";
import type { OfflineIdentity } from "./protected-storage.ts";
const memoryOnly: OfflineIdentity = {
  read: async () => null,
  save: async () => {},
  clear: async () => {},
};
const safely = <A>(body: () => Promise<A>, fallback: A) =>
  Effect.tryPromise({ try: body, catch: () => null }).pipe(
    Effect.catch(() => Effect.succeed(fallback)),
  );
function result(error: SessionFailure, previous: Member | null): SessionState {
  return error.code === "unavailable" && previous
    ? { status: "ready", member: previous, offline: true }
    : { status: error.code === "cancelled" ? "signed_out" : error.code };
}
function persist(identity: OfflineIdentity, state: SessionState) {
  if (state.status === "ready" && !state.offline)
    return safely(() => identity.save(state.member), undefined);
  if (state.status === "signed_out" || state.status === "not_a_member")
    return safely(() => identity.clear(), undefined);
  return Effect.void;
}
const matching = (member: Member | null, actor: string | null | undefined) =>
  actor === undefined || member?.userId === actor ? member : null;

export function sessionVerifier(
  verify: (credentials: Credentials) => Effect.Effect<Member, SessionFailure>,
  publish: (state: SessionState) => void,
  identity: OfflineIdentity = memoryOnly,
) {
  let revision = 0,
    disposed = false;
  let cached: Member | null = null;
  let actor: string | null | undefined;
  const alive = (current: number) => !disposed && current === revision;
  return {
    invalidate() {
      cached = null;
      actor = null;
      revision++;
    },
    dispose() {
      cached = null;
      actor = null;
      revision++;
      disposed = true;
    },
    unavailable() {
      const current = ++revision;
      return Effect.gen(function* () {
        const member = matching(cached ?? (yield* safely(() => identity.read(), null)), actor);
        if (alive(current)) {
          cached = member;
          publish(member ? { status: "ready", member, offline: true } : { status: "unavailable" });
        }
      });
    },
    update(credentials: Credentials | null) {
      const current = ++revision;
      actor = credentials?.user.id ?? null;
      return Effect.gen(function* () {
        if (!alive(current)) return;
        if (!credentials) {
          cached = null;
          yield* safely(() => identity.clear(), undefined);
          if (alive(current)) publish({ status: "signed_out" });
          return;
        }
        if (!matching(cached, credentials.user.id)) {
          cached = null;
          publish({ status: "loading" });
        }
        const stored = cached ?? (yield* safely(() => identity.read(), null));
        if (!alive(current)) return;
        const previous = matching(stored, credentials.user.id);
        cached = previous;
        const state = yield* verify(credentials).pipe(
          Effect.match({
            onSuccess: (member): SessionState => ({ status: "ready", member }),
            onFailure: (error) => result(error, previous),
          }),
        );
        if (!alive(current)) return;
        yield* persist(identity, state);
        if (alive(current)) {
          cached = state.status === "ready" ? state.member : null;
          publish(state);
        }
      });
    },
  };
}
