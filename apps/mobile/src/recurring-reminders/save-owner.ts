import { RecurringReminderSaveRuntime } from "./save-runtime.ts";
import type { RecurringReminderSaveOperations } from "./save-operations.ts";
export function recurringReminderSaveOwner(operations: RecurringReminderSaveOperations) {
  let current: RecurringReminderSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new RecurringReminderSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
