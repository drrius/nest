import { CalendarRenewalRuntime } from "./renewal-runtime.ts";
import type { CalendarRenewalOperations } from "./renewal-operations.ts";
export function calendarRenewalOwner(operations: CalendarRenewalOperations, date: string) {
  let current: CalendarRenewalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= new CalendarRenewalRuntime(operations, date);
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
