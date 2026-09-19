import * as Effect from "effect/Effect";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SessionFailure } from "./contracts.ts";
import type { subscribeSession } from "./subscription.ts";

export const signOutSession = (
  auth: SupabaseClient["auth"],
  subscription: ReturnType<typeof subscribeSession>,
) =>
  Effect.gen(function* () {
    subscription.hide();
    yield* Effect.tryPromise({
      try: async () => {
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
