import type { MealClient } from "./client.ts";
import { RecipeCreationRuntime } from "./recipe-creation-runtime.ts";
export function recipeCreationOwner(client: MealClient, uuid: () => string) {
  let current: RecipeCreationRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new RecipeCreationRuntime(client, uuid);
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
