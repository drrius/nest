import { CalendarChoreRuntime } from "./chore-runtime.ts";
import type { CalendarChoreOperations } from "./chore-operations.ts";
export function calendarChoreOwner(operations: CalendarChoreOperations, date: string) {
  let current: CalendarChoreRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new CalendarChoreRuntime(operations, date);
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
