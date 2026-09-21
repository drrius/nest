import { ExpenseApprovalRuntime } from "./approval-runtime.ts";
import type { ExpenseApprovalOperations } from "./approval-operations.ts";
export function expenseApprovalOwner(operations: ExpenseApprovalOperations, approvalId: string) {
  let current: ExpenseApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new ExpenseApprovalRuntime(operations, approvalId);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
