import { RecurringReadRuntime } from "./recurring-read-runtime.ts";
import type { RecurringReadOperations, RecurringReadTarget } from "./recurring-read-operations.ts";
export function recurringReadOwner(
  operations: RecurringReadOperations,
  target: RecurringReadTarget,
) {
  let current: RecurringReadRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new RecurringReadRuntime(operations, target);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
