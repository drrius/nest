import { RenewalReadRuntime } from "./read-runtime.ts";
import type { RenewalReadOperations, RenewalReadTarget } from "./read-operations.ts";
export function renewalReadOwner(operations: RenewalReadOperations, target: RenewalReadTarget) {
  let current: RenewalReadRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new RenewalReadRuntime(operations, target);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
