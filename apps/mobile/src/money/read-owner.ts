import { MoneyReadRuntime } from "./read-runtime.ts";
import type { MoneyReadOperations } from "./read-operations.ts";
import type { MoneyCacheTarget } from "../offline/money-contract.ts";
export function moneyReadOwner(
  operations: MoneyReadOperations,
  targets: readonly MoneyCacheTarget[],
) {
  let current: readonly MoneyReadRuntime[] | null = null;
  let subscriptions: (() => void)[] = [];
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = targets.map((target) => new MoneyReadRuntime(operations, target));
        const group = current;
        subscriptions = group.map((runtime) =>
          runtime.subscribe(() => {
            if (group.some((item) => item.getSnapshot().access === "verify"))
              for (const item of group) item.denyAccess();
          }),
        );
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        for (const unsubscribe of subscriptions) unsubscribe();
        subscriptions = [];
        current?.forEach((runtime) => runtime.dispose());
        current = null;
      };
    },
  };
}
