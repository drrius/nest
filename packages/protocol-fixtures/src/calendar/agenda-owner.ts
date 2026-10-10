import { AgendaRuntime } from "./agenda-runtime.ts";
import type { AgendaOperations } from "./agenda-operations.ts";
export function agendaOwner(operations: AgendaOperations, date: string) {
  let current: AgendaRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new AgendaRuntime(operations, date);
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
