import type { ReadPlannedRecipe } from "@nest/contracts/recipe-selection";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MealClient } from "./client.ts";
import { PlannedRecipeRuntime } from "./planned-recipe-runtime.ts";
export function plannedRecipeOwner(
  client: MealClient,
  account: OfflineAccount,
  target: ReadPlannedRecipe,
) {
  const captured = { ...target };
  let current: PlannedRecipeRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new PlannedRecipeRuntime(client, account, captured);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          current?.dispose();
          current = null;
        }
      };
    },
  };
}
