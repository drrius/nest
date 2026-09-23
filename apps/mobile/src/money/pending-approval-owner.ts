import { PendingApprovalRuntime } from "./pending-approval-runtime.ts";
import type { PendingApprovalOperations } from "./pending-approval-operations.ts";
export function pendingApprovalOwner(operations: PendingApprovalOperations) {
  let current: PendingApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new PendingApprovalRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
