import { ReceiptRecoveryRuntime } from "./receipt-recovery-runtime.ts";
import type { ReceiptRecoveryOperations } from "./receipt-recovery-operations.ts";
export function receiptRecoveryOwner(operations: ReceiptRecoveryOperations) {
  let current: ReceiptRecoveryRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new ReceiptRecoveryRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
