import { SettlementApprovalRuntime } from "./settlement-approval-runtime.ts";
import type { SettlementApprovalOperations } from "./settlement-approval-operations.ts";
export function settlementApprovalOwner(
  operations: SettlementApprovalOperations,
  approvalId: string,
) {
  let current: SettlementApprovalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new SettlementApprovalRuntime(operations, approvalId);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
