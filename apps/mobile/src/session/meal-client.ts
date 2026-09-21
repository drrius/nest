import type { MealProposalClient } from "../meals/proposal-client";
import type { EditMealPreparation } from "@nest/contracts/meal-preparation-edit";
import type { CreateMealPreparation } from "@nest/contracts/meal-preparation";
import type { ReadMealPreparation } from "@nest/contracts/meal-preparation-read";
import type { PlaceLeftovers } from "@nest/contracts/meal-leftovers";
import type {
  PlaceRecipe,
  ReplaceWithRecipe,
  ReadPlannedRecipe,
} from "@nest/contracts/recipe-selection";
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
    ingredients: {
      read: (input: Parameters<typeof client.ingredients.read>[0]) =>
        client.ingredients.read(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
      add: (input: Parameters<typeof client.ingredients.add>[0]) =>
        client.ingredients.add(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    },
    proposals: nativeProposals(client.proposals),
    editPreparation: (input: EditMealPreparation) =>
      client.editPreparation(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
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
    createPreparation: (input: CreateMealPreparation) =>
      client.createPreparation(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    readPreparation: (input: ReadMealPreparation) =>
      client.readPreparation(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    placeRecipe: (input: PlaceRecipe) =>
      client.placeRecipe(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    replaceWithRecipe: (input: ReplaceWithRecipe) =>
      client.replaceWithRecipe(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    plannedRecipe: (input: ReadPlannedRecipe) =>
      client.plannedRecipe(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    editRecipe: (input: EditRecipe) =>
      client.editRecipe(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    archiveRecipe: (input: ArchiveRecipe) =>
      client.archiveRecipe(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    createRecipe: (input: typeof CreateRecipe.Type) =>
      client.createRecipe(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    replace: (input: ReplaceMeal) =>
      client.replace(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    placeLeftovers: (input: PlaceLeftovers) =>
      client.placeLeftovers(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
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

function nativeProposals(client: MealProposalClient) {
  return {
    open: (proposal: string) =>
      client.open(proposal).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    edits: {
      execute: (input: Parameters<MealProposalClient["edits"]["execute"]>[0]) =>
        client.edits.execute(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
      recover: (operation: string) =>
        client.edits.recover(operation).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    },
    approve: (input: Parameters<MealProposalClient["approve"]>[0]) =>
      client.approve(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    reserve: (input: Parameters<MealProposalClient["reserve"]>[0]) =>
      client.reserve(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    generate: (input: Parameters<MealProposalClient["generate"]>[0]) =>
      client.generate(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recover: (proposal: string) =>
      client.recover(proposal).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    discard: (input: Parameters<MealProposalClient["discard"]>[0]) =>
      client.discard(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
