import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import type { SaveChoreReminder } from "@nest/contracts/chore-reminders";
import { choreReminderClient } from "../chore-reminders/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionChoreReminders(
  auth: SupabaseClient["auth"],
  account: Account,
  apiUrl: string,
) {
  const client = choreReminderClient(apiUrl, account, sessionCredentials(auth));
  return {
    detail: (occurrenceId: string) =>
      client.detail(occurrenceId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    save: (input: typeof SaveChoreReminder.Type) =>
      client.save(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recover: (input: typeof SaveChoreReminder.Type) =>
      client.recover(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancel: (input: typeof SaveChoreReminder.Type) =>
      client.cancel(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
