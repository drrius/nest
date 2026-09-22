import { PushEnrollmentRuntime, type EnrollmentDependencies } from "./enrollment-runtime.ts";
export function pushEnrollmentOwner(deps: EnrollmentDependencies) {
  let current: PushEnrollmentRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new PushEnrollmentRuntime(deps);
        void current.load();
      }
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
