import * as Effect from "effect/Effect";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member, SessionFailure, SessionState } from "./contracts";
import { sessionVerifier, type Credentials } from "./verification.ts";

export function subscribeSession(
  auth: SupabaseClient["auth"],
  verify: (credentials: Credentials) => Effect.Effect<Member, SessionFailure>,
  publish: (state: SessionState) => void,
) {
  const verifier = sessionVerifier(verify, publish);
  let abort = new AbortController();
  let revision = 0;
  let disposed = false;
  let hidden = false;
  const update = (credentials: Credentials | null) => {
    if (disposed || hidden) return;
    revision++;
    abort.abort();
    abort = new AbortController();
    void Effect.runPromise(verifier.update(credentials), { signal: abort.signal }).catch(
      () => undefined,
    );
  };
  const unavailable = () => {
    if (!disposed && !hidden) publish({ status: "unavailable" });
  };
  const initial = revision;
  const {
    data: { subscription },
  } = auth.onAuthStateChange((_event, session) => update(session));
  const refresh = async () => {
    if (hidden || disposed) return;
    const current = revision;
    try {
      const { data, error } = await auth.getSession();
      if (disposed || current !== revision) return;
      if (error) {
        unavailable();
        return;
      }
      update(data.session);
    } catch {
      if (current === revision) unavailable();
    }
  };
  if (initial === revision) void refresh();
  return {
    refresh,
    unavailable,
    signIn(credentials: Credentials) {
      hidden = false;
      update(credentials);
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
