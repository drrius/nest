import { useEffect, useRef, useState } from "react";
import { controllerPool } from "../offline/controller-pool";
import type { OfflineAccount } from "../offline/owner";
import type { GroceryClient } from "./client";
import { groceryEditor, initialEditorView, type EditorView } from "./editor-runtime";
import type { GroceryChange } from "./edit-contract";
const subscribe = controllerPool<EditorView, ReturnType<typeof groceryEditor>>();
export function useGroceryEditor(account: OfflineAccount, client: GroceryClient) {
  const [view, setView] = useState(initialEditorView);
  const runtime = useRef<ReturnType<typeof groceryEditor> | null>(null);
  useEffect(() => {
    const subscription = subscribe(
      account,
      (publish) => groceryEditor(account, client, publish),
      setView,
    );
    runtime.current = subscription.controller;
    void subscription.controller.load();
    return () => {
      runtime.current = null;
      subscription.release();
    };
  }, [account, client]);
  return {
    view,
    save: (change: GroceryChange) => {
      void runtime.current?.save(change);
    },
    retry: () => {
      void runtime.current?.retry();
    },
    discard: () => {
      void runtime.current?.discard();
    },
    reload: () => {
      void runtime.current?.load();
    },
  };
}
