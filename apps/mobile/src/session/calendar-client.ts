import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { calendarClient } from "../calendar/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionCalendar(auth: SupabaseClient["auth"], account: Account, apiUrl: string) {
  const client = calendarClient(apiUrl, account, sessionCredentials(auth));
  return {
    renewals: (input: Parameters<typeof client.renewals>[0]) =>
      client.renewals(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    consent: () => client.consent().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    setConsent: (input: Parameters<typeof client.setConsent>[0]) =>
      client.setConsent(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    begin: (input: Parameters<typeof client.begin>[0]) =>
      client.begin(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    publish: (input: Parameters<typeof client.publish>[0]) =>
      client.publish(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    chores: (date: string) =>
      client.chores(date).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    snapshots: () => client.snapshots().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
