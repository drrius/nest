import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetch } from "expo/fetch";
import { sessionCredentials } from "./credentials";
import { choreClient } from "../chores/client";
import type { Member } from "./contracts";

export function sessionChores(auth: SupabaseClient["auth"], member: Member, apiUrl: string) {
  const client = choreClient(
    apiUrl,
    { actor: member.userId, household: member.householdId },
    sessionCredentials(auth),
  );
  return {
    skip: (command: Parameters<typeof client.skip>[0]) =>
      client.skip(command).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    reschedule: (command: Parameters<typeof client.reschedule>[0]) =>
      client.reschedule(command).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    list: () => client.list().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    complete: (command: Parameters<typeof client.complete>[0]) =>
      client.complete(command).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
