import { SaveFoodPreferences, type FoodPreferences } from "@nest/contracts/food";
import { PreferenceRuntime } from "../preferences/runtime.ts";
import type { PreferenceView } from "../preferences/contracts.ts";
import type { FoodClient } from "./client.ts";
export type FoodView = PreferenceView<FoodPreferences>;
export class FoodRuntime extends PreferenceRuntime<FoodPreferences> {
  constructor(client: FoodClient, uuid: () => string) {
    super(client, uuid, SaveFoodPreferences, (preferences) => ({
      ...preferences,
      restrictions: [...preferences.restrictions],
      dislikes: [...preferences.dislikes],
    }));
  }
}
