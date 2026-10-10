import type { MealClient } from "./client.ts";
import { MealPlacementRuntime, type PlacementTarget } from "./placement-runtime.ts";
export function mealPlacementOwner(
  client: MealClient,
  target: PlacementTarget,
  uuid: () => string,
) {
  let current: MealPlacementRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new MealPlacementRuntime(client, target, uuid);
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
