import { ChoreReminderSaveRuntime } from "./save-runtime.ts";
import type { ChoreReminderSaveOperations } from "./save-operations.ts";
export function choreReminderSaveOwner(operations: ChoreReminderSaveOperations) {
  let current: ChoreReminderSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new ChoreReminderSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
