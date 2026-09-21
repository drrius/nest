import { PartnerRuntime } from "./partner-runtime.ts";
import type { PartnerOperations } from "./partner-operations.ts";
export function partnerOwner(operations: PartnerOperations, now: () => number) {
  let current: PartnerRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new PartnerRuntime(operations, now);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          current?.dispose();
          current = null;
        }
      };
    },
  };
}
