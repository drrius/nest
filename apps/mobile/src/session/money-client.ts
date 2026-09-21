import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { moneyClient } from "../money/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionMoney(auth: SupabaseClient["auth"], account: Account, apiUrl: string) {
  const client = moneyClient(apiUrl, account, sessionCredentials(auth));
  return {
    balance: () => client.balance().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    history: (before: string | null = null) =>
      client.history(before).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    detail: (eventId: string) =>
      client.detail(eventId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
