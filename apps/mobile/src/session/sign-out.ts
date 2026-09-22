import * as Effect from "effect/Effect";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SessionFailure } from "./contracts.ts";
import type { subscribeSession } from "./subscription.ts";

export const signOutSession = (
  auth: SupabaseClient["auth"],
  subscription: ReturnType<typeof subscribeSession>,
  beginLocalLogout: () => Promise<string | null | void> = async () => {},
  beforeCredentialRemoval: (token: string | null | void) => Promise<void> = async () => {},
) =>
  Effect.gen(function* () {
    subscription.hide();
    yield* Effect.tryPromise({
      try: async () => {
        const revokedToken = await beginLocalLogout();
        // Persist logout-pending before network cleanup so restart cannot restore
        // this identity. Only the cleanup callback receives the retained token.
        await beforeCredentialRemoval(revokedToken);
        await auth.stopAutoRefresh();
        // Hidden credentials cannot be read by normal SDK hydration. Retain
        // only this pre-logout token for a best-effort revocation attempt.
        if (revokedToken) await auth.admin.signOut(revokedToken, "local").catch(() => undefined);
        // Remote revocation can fail after the SDK has removed local credentials.
        // Read persistence back before reporting local logout complete.
        await auth.signOut({ scope: "local" });
        const { data, error } = await auth.getSession();
        if (error || data.session) throw new Error("Local logout incomplete");
      },
      catch: () => new SessionFailure({ code: "unavailable" }),
    });
    subscription.finishSignOut();
  });
