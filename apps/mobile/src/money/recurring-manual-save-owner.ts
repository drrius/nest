import { ManualCycleSaveRuntime } from "./recurring-manual-save-runtime.ts";
import type { ManualCycleSaveOperations } from "./recurring-manual-save-operations.ts";
export function manualCycleSaveOwner(operations: ManualCycleSaveOperations) {
  let current: ManualCycleSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new ManualCycleSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
