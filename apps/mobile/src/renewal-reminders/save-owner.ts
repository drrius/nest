import { RenewalReminderSaveRuntime } from "./save-runtime.ts";
import type { RenewalReminderSaveOperations } from "./save-operations.ts";
export function renewalReminderSaveOwner(operations: RenewalReminderSaveOperations) {
  let current: RenewalReminderSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new RenewalReminderSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
