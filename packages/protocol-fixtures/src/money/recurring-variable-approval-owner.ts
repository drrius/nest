import { VariableCycleApprovalRuntime } from "./recurring-variable-approval-runtime.ts";
import type { VariableCycleApprovalOperations } from "./recurring-variable-approval-operations.ts";
export function variableCycleApprovalOwner(
  operations: VariableCycleApprovalOperations,
  approvalId: string,
) {
  let current: VariableCycleApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new VariableCycleApprovalRuntime(operations, approvalId);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
