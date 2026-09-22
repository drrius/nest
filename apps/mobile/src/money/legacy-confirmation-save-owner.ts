import { LegacyConfirmationSaveRuntime } from "./legacy-confirmation-save-runtime.ts";
import type { LegacyConfirmationSaveOperations } from "./legacy-confirmation-save-operations.ts";
export function legacyConfirmationSaveOwner(operations: LegacyConfirmationSaveOperations) {
  let current: LegacyConfirmationSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new LegacyConfirmationSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
