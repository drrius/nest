import type { RoutineClient } from "./client.ts";
import { RoutineRuntime } from "./runtime.ts";
export function routineOwner(client: RoutineClient, uuid: () => string) {
  let current: RoutineRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new RoutineRuntime(client, uuid);
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
