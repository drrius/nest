import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { mealClient } from "../meals/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
export function sessionMeals(auth: SupabaseClient["auth"], account: Account, apiUrl: string) {
  const client = mealClient(apiUrl, account, sessionCredentials(auth));
  return {
    read: (weekStart: string) =>
      client.read(weekStart).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
