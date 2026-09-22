import { LegacyDismissalSaveRuntime } from "./legacy-dismissal-save-runtime.ts";
import type { LegacyDismissalSaveOperations } from "./legacy-dismissal-save-operations.ts";
export function legacyDismissalSaveOwner(operations: LegacyDismissalSaveOperations) {
  let current: LegacyDismissalSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new LegacyDismissalSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
