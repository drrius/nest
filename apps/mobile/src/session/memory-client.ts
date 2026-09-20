import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { memoryClient } from "../memory/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionMemory(auth: SupabaseClient["auth"], account: Account, apiUrl: string) {
  const client = memoryClient(apiUrl, account, sessionCredentials(auth));
  return {
    list: () => client.list().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    approval: (id: string) =>
      client.approval(id).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    propose: (input: Parameters<typeof client.propose>[0]) =>
      client.propose(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    decide: (input: Parameters<typeof client.decide>[0]) =>
      client.decide(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    remove: (input: Parameters<typeof client.remove>[0]) =>
      client.remove(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
