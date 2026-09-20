import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { setupClient } from "../setup/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionSetup(auth: SupabaseClient["auth"], account: Account, apiUrl: string) {
  const client = setupClient(apiUrl, account, sessionCredentials(auth));
  return {
    read: () => client.read().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
