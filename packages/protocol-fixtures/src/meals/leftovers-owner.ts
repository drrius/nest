import type { MealClient } from "./client.ts";
import { MealLeftoversRuntime, type LeftoversTarget } from "./leftovers-runtime.ts";
export function mealLeftoversOwner(
  client: MealClient,
  target: LeftoversTarget,
  uuid: () => string,
) {
  const retainedTarget = Object.freeze({ ...target });
  let current: MealLeftoversRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new MealLeftoversRuntime(client, retainedTarget, uuid);
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
