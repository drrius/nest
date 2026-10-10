import type { MealClient } from "./client.ts";
import { MealReplacementRuntime, type ReplacementTarget } from "./replacement-runtime.ts";
export function mealReplacementOwner(
  client: MealClient,
  target: ReplacementTarget,
  uuid: () => string,
) {
  let current: MealReplacementRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new MealReplacementRuntime(client, target, uuid);
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
