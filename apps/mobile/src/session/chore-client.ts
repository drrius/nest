import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetch } from "expo/fetch";
import { ChoreFailure, choreClient } from "../chores/client";
import type { Member } from "./contracts";

export function sessionChores(auth: SupabaseClient["auth"], member: Member, apiUrl: string) {
  const credentials = Effect.tryPromise({
    try: async () => {
      const { data, error } = await auth.getSession();
      if (error || !data.session) throw new Error("Session unavailable");
      return data.session;
    },
    catch: () => new ChoreFailure({ code: "session" }),
  });
  const client = choreClient(
    apiUrl,
    { actor: member.userId, household: member.householdId },
    credentials,
  );
  return {
    list: () => client.list().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    complete: (command: Parameters<typeof client.complete>[0]) =>
      client.complete(command).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
