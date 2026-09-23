import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import type { SaveRecurringReminder } from "@nest/contracts/recurring-reminders";
import { recurringReminderClient } from "../recurring-reminders/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionRecurringReminders(
  auth: SupabaseClient["auth"],
  account: Account,
  apiUrl: string,
) {
  const client = recurringReminderClient(apiUrl, account, sessionCredentials(auth));
  return {
    detail: (ruleId: string) =>
      client.detail(ruleId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    save: (input: typeof SaveRecurringReminder.Type) =>
      client.save(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recover: (input: typeof SaveRecurringReminder.Type) =>
      client.recover(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancel: (input: typeof SaveRecurringReminder.Type) =>
      client.cancel(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
