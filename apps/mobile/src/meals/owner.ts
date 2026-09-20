import type { OfflineAccount } from "../offline/owner.ts";
import type { MealClient } from "./client.ts";
import { MealWeekRuntime } from "./runtime.ts";
export function mealWeekOwner(client: MealClient, account: OfflineAccount, weekStart: string) {
  let current: MealWeekRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new MealWeekRuntime(client, account, weekStart);
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
