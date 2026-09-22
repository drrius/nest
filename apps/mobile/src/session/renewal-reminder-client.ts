import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import type { SaveRenewalReminder } from "@nest/contracts/reminders";
import { renewalReminderClient } from "../renewal-reminders/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionRenewalReminders(
  auth: SupabaseClient["auth"],
  account: Account,
  apiUrl: string,
) {
  const client = renewalReminderClient(apiUrl, account, sessionCredentials(auth));
  return {
    detail: (renewalId: string) =>
      client.detail(renewalId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    save: (input: typeof SaveRenewalReminder.Type) =>
      client.save(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recover: (input: typeof SaveRenewalReminder.Type) =>
      client.recover(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancel: (input: typeof SaveRenewalReminder.Type) =>
      client.cancel(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
