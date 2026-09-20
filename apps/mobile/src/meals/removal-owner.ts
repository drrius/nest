import type { MealClient } from "./client.ts";
import { MealRemovalRuntime, type RemovalTarget } from "./removal-runtime.ts";
export function mealRemovalOwner(client: MealClient, target: RemovalTarget, uuid: () => string) {
  let current: MealRemovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new MealRemovalRuntime(client, target, uuid);
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
