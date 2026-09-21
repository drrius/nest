import { SettlementSaveRuntime } from "./settlement-save-runtime.ts";
import type { SettlementSaveOperations } from "./settlement-save-operations.ts";
export function settlementSaveOwner(operations: SettlementSaveOperations) {
  let current: SettlementSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new SettlementSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
