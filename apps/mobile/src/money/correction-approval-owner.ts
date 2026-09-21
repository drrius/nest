import { CorrectionApprovalRuntime } from "./correction-approval-runtime.ts";
import type { CorrectionApprovalOperations } from "./correction-approval-operations.ts";
export function correctionApprovalOwner(
  operations: CorrectionApprovalOperations,
  approvalId: string,
) {
  let current: CorrectionApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new CorrectionApprovalRuntime(operations, approvalId);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
