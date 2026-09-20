import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import type { Grocery } from "@nest/contracts/groceries";
import { useOfflineAccount } from "../offline/provider";
import { groceryController } from "./controller";
import type { GroceryClient } from "./client";
import { groceryRuntime, initialGroceryView } from "./runtime";
export function useGroceries(client: GroceryClient, actor: string, household: string) {
  const { state: account, retry } = useOfflineAccount();
  const [view, setView] = useState(initialGroceryView);
  const runtime = useRef<ReturnType<typeof groceryRuntime> | null>(null);
  useEffect(() => {
    if (account.status !== "ready") return;
    const { session } = account.account;
    if (session.actor !== actor || session.household !== household) return;
    const subscription = groceryController(account.account, client, setView, () => {
      void Haptics.selectionAsync().catch(() => undefined);
    });
    const current = subscription.controller;
    runtime.current = current;
    void current.refresh();
    return () => {
      runtime.current = null;
      subscription.release();
    };
  }, [account, client, actor, household]);
  useFocusEffect(
    useCallback(() => {
      void runtime.current?.refresh();
    }, []),
  );
  const refresh = useCallback(() => {
    if (account.status === "error") retry();
    else void runtime.current?.refresh();
  }, [account.status, retry]);
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
    refresh,
    check: (item: Grocery, checked: boolean) =>
      runtime.current?.check(item, checked, Crypto.randomUUID()),
    discard: (operation: string) => runtime.current?.discard(operation),
  };
}
