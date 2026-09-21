import type { ReadSavedMeal } from "@nest/contracts/meal-library";
import type { MealClient } from "./client.ts";
import { RecipeArchiveRuntime } from "./recipe-archive-runtime.ts";
export function recipeArchiveOwner(
  client: MealClient,
  target: typeof ReadSavedMeal.Type,
  uuid: () => string,
) {
  let current: RecipeArchiveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new RecipeArchiveRuntime(client, target, uuid);
        void current.load();
      }
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
