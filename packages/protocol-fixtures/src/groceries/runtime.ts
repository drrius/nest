import { changeFailure } from "../offline/change-failure.ts";
import * as Effect from "effect/Effect";
import type { Grocery } from "@nest/contracts/groceries";
import { syncOfflineFlow, type SyncView } from "../offline/sync.ts";
import type { GroceryData, GroceryFlow } from "./flow.ts";
export interface GroceryView extends SyncView {
  data: GroceryData | null;
}
export const initialGroceryView: GroceryView = {
  data: null,
  syncing: false,
  stale: true,
  error: null,
  notice: null,
  access: "allowed",
};
export function groceryRuntime(
  flow: GroceryFlow,
  publish: (view: GroceryView) => void,
  onQueued: () => void = () => undefined,
) {
  let view = initialGroceryView,
    disposed = false;
  const abort = new AbortController();
  const changes = new Map<string, { operation: string; checked: boolean }>();
  const emit = (patch: Partial<GroceryView>) => {
    if (!disposed) {
      view = { ...view, ...patch };
      publish(view);
    }
  };
  const run = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromise(effect, { signal: abort.signal });
  const read = async () => {
    emit({ data: await run(flow.read) });
  };
  const refresh = syncOfflineFlow(flow, { run, read, emit, disposed: () => disposed });
  const change = async <E>(action: Effect.Effect<void, E>) => {
    try {
      await run(action);
      await read();
      void refresh();
      return true;
    } catch (error) {
      emit({ error: changeFailure(error) });
      return false;
    }
  };
  return {
    refresh,
    check(item: Grocery, checked: boolean, operation: string) {
      const current = view.data?.groceries.find((row) => row.itemId === item.itemId);
      if (disposed || view.access !== "allowed" || !current || current.conflict) return;
      if ((changes.get(item.itemId)?.checked ?? current.checked) === checked) return;
      changes.set(item.itemId, { checked, operation });
      return change(flow.check(current, checked, operation))
        .then((saved) => {
          if (saved && !disposed) onQueued();
        })
        .finally(() => {
          if (changes.get(item.itemId)?.operation === operation) changes.delete(item.itemId);
        });
    },
    discard: (operation: string) => {
      if (!disposed) void change(flow.discard(operation));
    },
    dispose() {
      disposed = true;
      abort.abort();
    },
  };
}
