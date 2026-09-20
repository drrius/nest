import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import type { Grocery } from "@nest/contracts/groceries";
import { controllerPool } from "../offline/controller-pool";
import { useOfflineAccount } from "../offline/provider";
import { groceryFlow } from "./flow";
import type { GroceryClient } from "./client";
import { groceryRuntime, initialGroceryView, type GroceryView } from "./runtime";
const subscribe = controllerPool<GroceryView, ReturnType<typeof groceryRuntime>>();
export function useGroceries(client: GroceryClient, actor: string, household: string) {
  const { state: account, retry } = useOfflineAccount();
  const [view, setView] = useState(initialGroceryView);
  const runtime = useRef<ReturnType<typeof groceryRuntime> | null>(null);
  useEffect(() => {
    if (account.status !== "ready") return;
    const { session } = account.account;
    if (session.actor !== actor || session.household !== household) return;
    const subscription = subscribe(
      account.account,
      (publish) =>
        groceryRuntime(groceryFlow(account.account, client), publish, () => {
          void Haptics.selectionAsync().catch(() => undefined);
        }),
      setView,
    );
    const current = subscription.controller;
    runtime.current = current;
    void current.refresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void current.refresh();
    });
    return () => {
      runtime.current = null;
      listener.remove();
      subscription.release();
    };
  }, [account, client, actor, household]);
  return {
    view:
      account.status === "ready"
        ? view
        : {
            ...initialGroceryView,
            error:
              account.status === "error"
                ? "Could not open saved groceries. Try refreshing again."
                : null,
          },
    refresh: () => {
      if (account.status === "error") retry();
      else void runtime.current?.refresh();
    },
    check: (item: Grocery, checked: boolean) =>
      runtime.current?.check(item, checked, Crypto.randomUUID()),
    discard: (operation: string) => runtime.current?.discard(operation),
  };
}
