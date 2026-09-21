import type { EditRecipe } from "@nest/contracts/recipe-edit";
import type { ArchiveRecipe } from "@nest/contracts/recipe-archive";
import type { CreateRecipe } from "@nest/contracts/recipe-creation";
import type { ReplaceMeal } from "@nest/contracts/meal-replacement";
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
    library: {
      read: (afterId: string | null = null, revision: string | null = null) =>
        client.library
          .read(afterId, revision)
          .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
      recipe: (definitionId: string, revision: string) =>
        client.library
          .recipe(definitionId, revision)
          .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    },
    editRecipe: (input: EditRecipe) =>
      client.editRecipe(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    archiveRecipe: (input: ArchiveRecipe) =>
      client.archiveRecipe(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    createRecipe: (input: typeof CreateRecipe.Type) =>
      client.createRecipe(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    replace: (input: ReplaceMeal) =>
      client.replace(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
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
