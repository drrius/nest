import type { MemoryClient } from "./client.ts";
import { MemoryRuntime } from "./runtime.ts";
export function memoryOwner(client: MemoryClient, uuid: () => string, approvalId: string | null) {
  let current: MemoryRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new MemoryRuntime(client, uuid, approvalId);
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
