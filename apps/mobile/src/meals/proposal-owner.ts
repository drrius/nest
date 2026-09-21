import { MealProposalRuntime } from "./proposal-runtime.ts";
export function mealProposalOwner(
  client: ConstructorParameters<typeof MealProposalRuntime>[0],
  account: ConstructorParameters<typeof MealProposalRuntime>[1],
  weekStart: string,
  uuid: () => string,
) {
  let current: MealProposalRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new MealProposalRuntime(client, account, weekStart, uuid);
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
