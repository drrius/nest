import { RecurringStateSaveRuntime } from "./recurring-state-save-runtime.ts";
import type { RecurringStateSaveOperations } from "./recurring-state-save-operations.ts";
export function recurringStateSaveOwner(operations: RecurringStateSaveOperations) {
  let current: RecurringStateSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new RecurringStateSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
