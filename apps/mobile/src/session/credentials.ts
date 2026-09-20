import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { isAuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { ChoreFailure } from "../chores/client.ts";

export const sessionCredentials = (auth: SupabaseClient["auth"]) =>
  Effect.tryPromise({
    try: async () => {
      const { data, error } = await auth.getSession();
      if (error)
        throw new ChoreFailure({
          code:
            isAuthSessionMissingError(error) ||
            [
              "refresh_token_not_found",
              "refresh_token_already_used",
              "session_not_found",
              "bad_jwt",
            ].includes(error.code ?? "") ||
            error.status === 401 ||
            error.status === 403
              ? "session"
              : "unavailable",
        });
      if (!data.session) throw new ChoreFailure({ code: "session" });
      return data.session;
    },
    catch: (error) =>
      Schema.is(ChoreFailure)(error) ? error : new ChoreFailure({ code: "unavailable" }),
  });
