import { IngredientRuntime } from "./ingredient-runtime.ts";
export function ingredientOwner(
  client: ConstructorParameters<typeof IngredientRuntime>[0],
  account: ConstructorParameters<typeof IngredientRuntime>[1],
  weekStart: string,
  uuid: () => string,
) {
  let current: IngredientRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new IngredientRuntime(client, account, weekStart, uuid);
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
