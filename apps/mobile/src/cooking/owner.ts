import type { CookingClient } from "./client.ts";
import { CookingRuntime } from "./runtime.ts";
export function cookingOwner(client: CookingClient, uuid: () => string) {
  let current: CookingRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new CookingRuntime(client, uuid);
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
