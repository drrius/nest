import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { type SupabaseClient } from "@supabase/supabase-js";
import { definitiveAuthFailure } from "./auth-failure.ts";
import { ChoreFailure } from "../chores/client.ts";

export const sessionCredentials = (auth: SupabaseClient["auth"]) =>
  Effect.tryPromise({
    try: async () => {
      const { data, error } = await auth.getSession();
      if (error)
        throw new ChoreFailure({
          code: definitiveAuthFailure(error) ? "session" : "unavailable",
        });
      if (!data.session) throw new ChoreFailure({ code: "session" });
      return data.session;
    },
    catch: (error) =>
      Schema.is(ChoreFailure)(error) ? error : new ChoreFailure({ code: "unavailable" }),
  });
