import { MealPreparationEditRuntime } from "./preparation-edit-runtime.ts";
import type { PreparationTarget } from "./preparation-runtime.ts";
export function mealPreparationEditOwner(
  client: ConstructorParameters<typeof MealPreparationEditRuntime>[0],
  target: PreparationTarget,
  uuid: () => string,
) {
  const retainedTarget = Object.freeze({ ...target });
  let current: MealPreparationEditRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new MealPreparationEditRuntime(client, retainedTarget, uuid);
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
