import { SaveCookingPreferences, type CookingPreferences } from "@nest/contracts/cooking";
import { PreferenceRuntime } from "../preferences/runtime.ts";
import type { PreferenceView } from "../preferences/contracts.ts";
import type { CookingClient } from "./client.ts";
export type CookingView = PreferenceView<CookingPreferences>;
export class CookingRuntime extends PreferenceRuntime<CookingPreferences> {
  constructor(client: CookingClient, uuid: () => string) {
    super(client, uuid, SaveCookingPreferences, (preferences) => ({
      ...preferences,
      mealSlots: [...preferences.mealSlots],
    }));
  }
}
