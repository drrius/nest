import type { ReceiptTarget } from "@nest/contracts/receipt";
import { ReceiptViewRuntime } from "./receipt-view-runtime.ts";
import type { ReceiptViewOperations } from "./receipt-view-operations.ts";
export function receiptViewOwner(operations: ReceiptViewOperations, target: ReceiptTarget) {
  let current: ReceiptViewRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new ReceiptViewRuntime(operations, target);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
