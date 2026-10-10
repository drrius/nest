import type { ReadSavedMeal } from "@nest/contracts/meal-library";
import type { EditClient } from "./recipe-edit-runtime.ts";
import { RecipeEditRuntime } from "./recipe-edit-runtime.ts";
export function recipeEditOwner(
  client: EditClient,
  target: typeof ReadSavedMeal.Type,
  uuid: () => string,
) {
  let current: RecipeEditRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new RecipeEditRuntime(client, target, uuid);
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
