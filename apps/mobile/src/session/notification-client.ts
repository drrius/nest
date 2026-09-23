import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { notificationClient } from "../notifications/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionNotification(
  auth: SupabaseClient["auth"],
  account: Account,
  apiUrl: string,
) {
  const client = notificationClient(apiUrl, account, sessionCredentials(auth));
  return {
    summary: (input: Parameters<typeof client.summary>[0]) =>
      client.summary(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    read: () => client.read().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    save: (input: Parameters<typeof client.save>[0]) =>
      client.save(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
