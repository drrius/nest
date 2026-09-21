import { VariableCycleSaveRuntime } from "./recurring-variable-save-runtime.ts";
import type { VariableCycleSaveOperations } from "./recurring-variable-save-operations.ts";
export function variableCycleSaveOwner(operations: VariableCycleSaveOperations) {
  let current: VariableCycleSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new VariableCycleSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
