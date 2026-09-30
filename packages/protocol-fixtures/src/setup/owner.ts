import type { SetupClient } from "./client.ts";
import { SetupRuntime } from "./runtime.ts";
export function setupOwner(client: SetupClient) {
  let current: SetupRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new SetupRuntime(client);
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
