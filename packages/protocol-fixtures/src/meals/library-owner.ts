import { MealLibraryRuntime } from "./library-runtime.ts";
import { SavedMealRuntime } from "./recipe-runtime.ts";
import type { MealLibraryClient } from "./library-client.ts";
import type { ReadSavedMeal } from "@nest/contracts/meal-library";
function readOwner<A extends { dispose: () => void }>(create: () => A) {
  let current: A | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= create();
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
export const mealLibraryOwner = (client: MealLibraryClient) =>
  readOwner(() => new MealLibraryRuntime(client));
export const savedMealOwner = (client: MealLibraryClient, target: typeof ReadSavedMeal.Type) =>
  readOwner(() => new SavedMealRuntime(client, target));
