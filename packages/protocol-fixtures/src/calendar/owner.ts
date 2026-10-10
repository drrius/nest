import type { CalendarRuntime } from "./runtime.ts";
export function calendarOwner(
  create: () => CalendarRuntime | null,
  start: (runtime: CalendarRuntime) => () => void,
) {
  let runtime: CalendarRuntime | null = null,
    stop: (() => void) | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => runtime,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!runtime) {
        runtime = create();
        if (runtime) stop = start(runtime);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stop?.();
          stop = null;
          runtime?.dispose();
          runtime = null;
        }
      };
    },
  };
}
