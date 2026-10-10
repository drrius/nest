import { RecurringApprovalRuntime } from "./recurring-approval-runtime.ts";
import type { RecurringApprovalOperations } from "./recurring-approval-operations.ts";
export function recurringApprovalOwner(
  operations: RecurringApprovalOperations,
  approvalId: string,
) {
  let current: RecurringApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new RecurringApprovalRuntime(operations, approvalId);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
