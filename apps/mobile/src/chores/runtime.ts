import * as Effect from "effect/Effect";
import type { Chore } from "@nest/contracts/chores";
import { choreSync } from "./sync.ts";
import type { ChoreData, ChoreFlow } from "./flow.ts";

export interface ChoreView {
  data: ChoreData | null;
  syncing: boolean;
  stale: boolean;
  error: string | null;
  notice: string | null;
  access: "allowed" | "verify";
}
export const initialChoreView: ChoreView = {
  data: null,
  syncing: false,
  stale: true,
  error: null,
  notice: null,
  access: "allowed",
};
export function choreRuntime(
  flow: ChoreFlow,
  publish: (view: ChoreView) => void,
  onQueued: () => void = () => undefined,
) {
  let view = initialChoreView;
  let disposed = false;
  const abort = new AbortController();
  const enqueueing = new Set<string>();
  const emit = (patch: Partial<ChoreView>) => {
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
  const refresh = choreSync(flow, { run, read, emit, disposed: () => disposed });
  const change = async <E>(action: Effect.Effect<void, E>) => {
    try {
      await run(action);
      await read();
      void refresh();
      return true;
    } catch {
      emit({ error: "Could not save that change on this phone. Please try again." });
      return false;
    }
  };
  return {
    refresh,
    complete(chore: Chore, operation: string, completedOn: string) {
      const item = view.data?.chores.find((row) => row.occurrenceId === chore.occurrenceId);
      if (
        disposed ||
        view.access !== "allowed" ||
        enqueueing.has(chore.occurrenceId) ||
        item?.done ||
        item?.pending
      )
        return;
      enqueueing.add(chore.occurrenceId);
      return change(flow.complete(chore, operation, completedOn))
        .then((saved) => {
          if (saved && !disposed) onQueued();
        })
        .finally(() => enqueueing.delete(chore.occurrenceId));
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
