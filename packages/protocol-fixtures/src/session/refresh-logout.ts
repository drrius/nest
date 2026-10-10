import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { isAuthRefreshDiscardedError, type SupabaseClient } from "@supabase/supabase-js";
import { StoredSession } from "./protected-session-record.ts";
import { SessionFailure } from "./contracts.ts";

// Use the existing SDK instance so an in-flight refresh is coalesced. During
// required cleanup, storage accepts only same-session rotations without identity.
export function refreshLogoutCredentials(auth: SupabaseClient["auth"], refreshToken: string) {
  return Effect.tryPromise({
    try: async () => {
      let result = await auth.refreshSession({ refresh_token: refreshToken });
      // An older in-flight request may be discarded because logout hid SDK
      // storage. It has finished now; retry its parent token once, sequentially.
      // Supabase permits reuse of the parent of the current refresh token.
      if (isAuthRefreshDiscardedError(result.error))
        result = await auth.refreshSession({ refresh_token: refreshToken });
      const { data, error } = result;
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
