import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import type { SaveMealReminder } from "@nest/contracts/meal-reminders";
import { mealReminderClient } from "../meal-reminders/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionMealReminders(
  auth: SupabaseClient["auth"],
  account: Account,
  apiUrl: string,
) {
  const client = mealReminderClient(apiUrl, account, sessionCredentials(auth));
  return {
    detail: (entryId: string) =>
      client.detail(entryId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    save: (input: typeof SaveMealReminder.Type) =>
      client.save(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recover: (input: typeof SaveMealReminder.Type) =>
      client.recover(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancel: (input: typeof SaveMealReminder.Type) =>
      client.cancel(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
