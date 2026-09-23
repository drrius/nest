import { SummaryReadRuntime } from "./summary-runtime.ts";
import type { SummaryReadOperations, SummaryReadTarget } from "./summary-operations.ts";
export function summaryReadOwner(operations: SummaryReadOperations, target: SummaryReadTarget) {
  let current: SummaryReadRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new SummaryReadRuntime(operations, target);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
