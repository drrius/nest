import { RenewalSaveRuntime } from "./save-runtime.ts";
import type { RenewalSaveOperations } from "./save-operations.ts";
export function renewalSaveOwner(operations: RenewalSaveOperations) {
  let current: RenewalSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new RenewalSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
