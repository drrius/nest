import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import type { SaveGroceryReminder } from "@nest/contracts/grocery-reminders";
import { groceryReminderClient } from "../grocery-reminders/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionGroceryReminders(
  auth: SupabaseClient["auth"],
  account: Account,
  apiUrl: string,
) {
  const client = groceryReminderClient(apiUrl, account, sessionCredentials(auth));
  return {
    detail: (itemId: string) =>
      client.detail(itemId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    save: (input: typeof SaveGroceryReminder.Type) =>
      client.save(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recover: (input: typeof SaveGroceryReminder.Type) =>
      client.recover(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancel: (input: typeof SaveGroceryReminder.Type) =>
      client.cancel(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
