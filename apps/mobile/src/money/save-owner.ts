import { ExpenseSaveRuntime } from "./save-runtime.ts";
import type { ExpenseSaveOperations } from "./save-operations.ts";
export function expenseSaveOwner(operations: ExpenseSaveOperations) {
  let current: ExpenseSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new ExpenseSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
