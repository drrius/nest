import { GroceryReminderSaveRuntime } from "./save-runtime.ts";
import type { GroceryReminderSaveOperations } from "./save-operations.ts";
export function groceryReminderSaveOwner(operations: GroceryReminderSaveOperations) {
  let current: GroceryReminderSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new GroceryReminderSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
