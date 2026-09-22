import { LegacyConfirmationApprovalRuntime } from "./legacy-confirmation-approval-runtime.ts";
import type { LegacyConfirmationApprovalOperations } from "./legacy-confirmation-approval-operations.ts";
export function legacyConfirmationApprovalOwner(
  operations: LegacyConfirmationApprovalOperations,
  approvalId: string,
) {
  let current: LegacyConfirmationApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new LegacyConfirmationApprovalRuntime(operations, approvalId);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
