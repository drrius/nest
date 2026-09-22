import * as Effect from "effect/Effect";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfflineIdentity } from "./protected-storage.ts";
import { definitiveAuthFailure } from "./auth-failure.ts";
import type { Member, SessionFailure, SessionState } from "./contracts";
import { sessionVerifier, type Credentials } from "./verification.ts";

export function subscribeSession(
  auth: SupabaseClient["auth"],
  verify: (credentials: Credentials) => Effect.Effect<Member, SessionFailure>,
  publish: (state: SessionState) => void,
  identity?: OfflineIdentity,
) {
  const verifier = sessionVerifier(verify, publish, identity);
  let abort = new AbortController();
  let revision = 0;
  let disposed = false;
  let hidden = false;
  const update = (credentials: Credentials | null) => {
    if (disposed || hidden) return;
    revision++;
    abort.abort();
    abort = new AbortController();
    return Effect.runPromise(verifier.update(credentials), { signal: abort.signal }).catch(
      () => undefined,
    );
  };
  const unavailable = () => {
    if (!disposed && !hidden)
      return Effect.runPromise(verifier.unavailable()).catch(() => undefined);
  };
  const initial = revision;
  const {
    data: { subscription },
  } = auth.onAuthStateChange((event, session) => {
    // INITIAL_SESSION can be null for a retryable refresh failure. The explicit
    // getSession path retains the error classification needed for recovery.
    if (event !== "INITIAL_SESSION") void update(session);
  });
  const load = async () => {
    if (hidden || disposed) return;
    const current = revision;
    try {
      const { data, error } = await auth.getSession();
      if (disposed || current !== revision) return;
      if (error) {
        if (definitiveAuthFailure(error)) await update(null);
        else await unavailable();
        return;
      }
      await update(data.session);
    } catch {
      if (current === revision) await unavailable();
    }
  };
  const refresh = coalesce(load);
  if (initial === revision) void refresh();
  return {
    canRefresh: () => !hidden && !disposed,
    refresh,
    unavailable,
    signIn(credentials: Credentials) {
      hidden = false;
      return Promise.resolve(update(credentials));
    },
    hide() {
      if (disposed) return;
      hidden = true;
      revision++;
      abort.abort();
      verifier.invalidate();
      publish({ status: "logout_pending" });
    },
    finishSignOut() {
      if (!disposed && hidden) publish({ status: "signed_out" });
    },
    dispose() {
      disposed = true;
      abort.abort();
      verifier.dispose();
      subscription.unsubscribe();
      void auth.stopAutoRefresh().catch(() => undefined);
    },
  };
}

function coalesce(load: () => Promise<void>) {
  let pending: Promise<void> | null = null;
  return () => {
    pending ??= load().finally(() => {
      pending = null;
    });
    return pending;
  };
}
