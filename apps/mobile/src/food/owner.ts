import type { FoodClient } from "./client.ts";
import { FoodRuntime } from "./runtime.ts";
export function foodOwner(client: FoodClient, uuid: () => string) {
  let current: FoodRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new FoodRuntime(client, uuid);
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
