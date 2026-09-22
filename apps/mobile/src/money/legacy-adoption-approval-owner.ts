import { LegacyAdoptionApprovalRuntime } from "./legacy-adoption-approval-runtime.ts";
import type { LegacyAdoptionApprovalOperations } from "./legacy-adoption-approval-operations.ts";
export function legacyAdoptionApprovalOwner(
  operations: LegacyAdoptionApprovalOperations,
  approvalId: string,
) {
  let current: LegacyAdoptionApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new LegacyAdoptionApprovalRuntime(operations, approvalId);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
