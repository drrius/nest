import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetch } from "expo/fetch";
import { sessionCredentials } from "./credentials";
import { groceryClient } from "../groceries/client";
import type { Member } from "./contracts";
export function sessionGroceries(auth: SupabaseClient["auth"], member: Member, apiUrl: string) {
  const client = groceryClient(
    apiUrl,
    { actor: member.userId, household: member.householdId },
    sessionCredentials(auth),
  );
  return {
    list: () => client.list().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    check: (command: Parameters<typeof client.check>[0]) =>
      client.check(command).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
