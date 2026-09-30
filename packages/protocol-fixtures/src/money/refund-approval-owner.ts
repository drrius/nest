import { RefundApprovalRuntime } from "./refund-approval-runtime.ts";
import type { RefundApprovalOperations } from "./refund-approval-operations.ts";
export function refundApprovalOwner(operations: RefundApprovalOperations, approvalId: string) {
  let current: RefundApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new RefundApprovalRuntime(operations, approvalId);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
