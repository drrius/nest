import { LegacyAdoptionSaveRuntime } from "./legacy-adoption-save-runtime.ts";
import type { LegacyAdoptionSaveOperations } from "./legacy-adoption-save-operations.ts";
export function legacyAdoptionSaveOwner(operations: LegacyAdoptionSaveOperations) {
  let current: LegacyAdoptionSaveRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new LegacyAdoptionSaveRuntime(operations);
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.dispose();
        current = null;
      };
    },
  };
}
