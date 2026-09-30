import { RecurringSaveRuntime } from "./recurring-save-runtime.ts";
import type { RecurringSaveOperations } from "./recurring-save-operations.ts";
export function recurringSaveOwner(operations: RecurringSaveOperations) {
  let current: RecurringSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new RecurringSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
