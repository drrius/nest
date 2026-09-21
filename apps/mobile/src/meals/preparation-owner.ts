import { MealPreparationRuntime, type PreparationTarget } from "./preparation-runtime.ts";
export function mealPreparationOwner(
  client: ConstructorParameters<typeof MealPreparationRuntime>[0],
  target: PreparationTarget,
  uuid: () => string,
) {
  const retainedTarget = Object.freeze({ ...target });
  let current: MealPreparationRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new MealPreparationRuntime(client, retainedTarget, uuid);
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
