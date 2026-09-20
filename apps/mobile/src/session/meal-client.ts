import type { MoveMeal } from "@nest/contracts/meal-move";
import type { RemoveMeal } from "@nest/contracts/meal-removal";
import type { PlaceMeal } from "@nest/contracts/meal-placement";
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
    move: (input: MoveMeal) =>
      client.move(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    remove: (input: RemoveMeal) =>
      client.remove(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    place: (input: PlaceMeal) =>
      client.place(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    read: (weekStart: string) =>
      client.read(weekStart).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
