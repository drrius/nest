import { ManualCycleApprovalRuntime } from "./recurring-manual-approval-runtime.ts";
import type { ManualCycleApprovalOperations } from "./recurring-manual-approval-operations.ts";
export function manualCycleApprovalOwner(
  operations: ManualCycleApprovalOperations,
  approvalId: string,
) {
  let current: ManualCycleApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new ManualCycleApprovalRuntime(operations, approvalId);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
