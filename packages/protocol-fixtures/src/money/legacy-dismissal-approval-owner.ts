import { LegacyDismissalApprovalRuntime } from "./legacy-dismissal-approval-runtime.ts";
import type { LegacyDismissalApprovalOperations } from "./legacy-dismissal-approval-operations.ts";
export function legacyDismissalApprovalOwner(
  operations: LegacyDismissalApprovalOperations,
  approvalId: string,
) {
  let current: LegacyDismissalApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new LegacyDismissalApprovalRuntime(operations, approvalId);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
