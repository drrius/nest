import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StoredSession } from "./protected-session-record.ts";
import { SessionFailure } from "./contracts.ts";

// Supply a separate non-persisting SDK instance with no UI subscription.
// The pending-logout store checks actor/session continuity before persisting.
export function refreshLogoutCredentials(auth: SupabaseClient["auth"], refreshToken: string) {
  return Effect.tryPromise({
    try: async () => {
      const { data, error } = await auth.refreshSession({ refresh_token: refreshToken });
      if (error || !data.session) throw new Error("Logout refresh unavailable");
      return data.session;
    },
    catch: () => new SessionFailure({ code: "unavailable" }),
  }).pipe(
    Effect.timeout("15 seconds"),
    Effect.flatMap(Schema.decodeUnknownEffect(StoredSession)),
    Effect.mapError(() => new SessionFailure({ code: "unavailable" })),
  );
}
