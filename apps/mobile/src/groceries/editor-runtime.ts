import * as Effect from "effect/Effect";
import type { GroceryCategory } from "@nest/contracts/groceries";
import type { OfflineAccount } from "../offline/owner.ts";
import type { GroceryClient } from "./client.ts";
import type { GroceryChange } from "./edit-contract.ts";
export interface EditorView {
  loaded: boolean;
  pending: GroceryChange | null;
  working: boolean;
  saved: boolean;
  error: string | null;
  categories: readonly (typeof GroceryCategory.Type)[];
  categoryError: string | null;
}
export const initialEditorView: EditorView = {
  loaded: false,
  pending: null,
  working: false,
  saved: false,
  error: null,
  categories: [],
  categoryError: null,
};
function message(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : null;
  if (code === "session" || code === "forbidden")
    return "Verify your account before retrying. Your attempt is kept.";
  if (code === "conflict" || code === "removed")
    return "This item changed or was removed. Review the current checklist before starting a new edit.";
  if (code === "invalid")
    return "These details could not be saved. Review them before starting a new edit.";
  return "Could not confirm the save. Your exact attempt is kept. Retry online or review the checklist.";
}
export function groceryEditor(
  { store, session }: OfflineAccount,
  client: GroceryClient,
  publish: (view: EditorView) => void,
) {
  let view = initialEditorView,
    disposed = false;
  const abort = new AbortController();
  const emit = (patch: Partial<EditorView>) => {
    if (!disposed) {
      view = { ...view, ...patch };
      publish(view);
    }
  };
  const run = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.runPromise(effect, { signal: abort.signal });
  const work = async (action: () => Promise<void>) => {
    if (disposed || view.working) return;
    emit({ working: true, error: null, saved: false });
    try {
      await action();
    } catch (error) {
      emit({ error: message(error) });
    } finally {
      emit({ working: false });
    }
  };
  const save = (change: GroceryChange) =>
    work(async () => {
      if (!view.loaded) return;
      const pending = await run(store.stageGroceryChange(session, change));
      emit({ pending });
      await run(client.change(pending));
      await run(store.clearGroceryChange(session, pending.command.operationId));
      emit({ pending: null, saved: true });
    });
  return {
    load: () =>
      work(async () => {
        const pending = await run(store.readGroceryChange(session));
        emit({ loaded: true, pending });
        try {
          emit({ categories: await run(client.categories()), categoryError: null });
        } catch {
          emit({ categoryError: "Categories could not load. Existing category choices are kept." });
        }
      }),
    save,
    retry: () => (view.pending ? save(view.pending) : Promise.resolve()),
    discard: () =>
      work(async () => {
        if (!view.pending) return;
        await run(store.clearGroceryChange(session, view.pending.command.operationId));
        emit({ pending: null });
      }),
    dispose() {
      disposed = true;
      abort.abort();
    },
  };
}
