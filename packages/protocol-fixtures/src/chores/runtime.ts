import { changeFailure } from "../offline/change-failure.ts";
import { ChoreChangeRuntime } from "./change-runtime.ts";
import * as Effect from "effect/Effect";
import type { Chore } from "@nest/contracts/chores";
import { syncOfflineFlow } from "../offline/sync.ts";
import type { ChoreData, ChoreFlow } from "./flow.ts";

export interface ChoreView {
  changeStage: "ready" | "saving" | "uncertain" | "reload";
  pendingWrite: boolean;
  changeNotice: string | null;
  changed: number;
  data: ChoreData | null;
  syncing: boolean;
  stale: boolean;
  error: string | null;
  notice: string | null;
  access: "allowed" | "verify";
}
export const initialChoreView: ChoreView = {
  changeStage: "ready",
  pendingWrite: false,
  changeNotice: null,
  changed: 0,
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
  const refresh = syncOfflineFlow(flow, { run, read, emit, disposed: () => disposed });
  const online = new ChoreChangeRuntime({
    flow,
    run,
    view: () => view,
    emit,
    refresh,
    blocked: () => disposed || enqueueing.size > 0,
  });
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
    refresh: online.refresh,
    requestTransfer: online.requestTransfer,
    respondTransfer: online.respondTransfer,
    skip: (chore: Chore, operation: string) => online.begin(chore, operation),
    reschedule: (chore: Chore, operation: string, date: string) =>
      online.begin(chore, operation, date),
    retryChange: online.retry,
    complete(chore: Chore, operation: string, completedOn: string) {
      const item = view.data?.chores.find((row) => row.occurrenceId === chore.occurrenceId);
      if (
        disposed ||
        view.access !== "allowed" ||
        view.changeStage !== "ready" ||
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
      if (!disposed && view.changeStage === "ready") void change(flow.discard(operation));
    },
    dispose() {
      disposed = true;
      online.dispose();
      abort.abort();
    },
  };
}
