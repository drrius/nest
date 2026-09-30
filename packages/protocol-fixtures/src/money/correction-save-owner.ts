import { CorrectionSaveRuntime } from "./correction-save-runtime.ts";
import type { CorrectionSaveOperations } from "./correction-save-operations.ts";
export function correctionSaveOwner(operations: CorrectionSaveOperations) {
  let current: CorrectionSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new CorrectionSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
