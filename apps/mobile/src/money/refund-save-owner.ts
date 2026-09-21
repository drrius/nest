import { RefundSaveRuntime } from "./refund-save-runtime.ts";
import type { RefundSaveOperations } from "./refund-save-operations.ts";
export function refundSaveOwner(operations: RefundSaveOperations) {
  let current: RefundSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new RefundSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
