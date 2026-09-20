import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import type { Chore } from "@nest/contracts/chores";
import { useOfflineAccount } from "../offline/provider";
import { choreController } from "./controller";
import type { ChoreClient } from "./client";
import { choreRuntime, initialChoreView } from "./runtime";

export function useChores(client: ChoreClient, actor: string, household: string) {
  const { state: account, retry } = useOfflineAccount();
  const [view, setView] = useState(initialChoreView);
  const runtime = useRef<ReturnType<typeof choreRuntime> | null>(null);
  useEffect(() => {
    if (account.status !== "ready") return;
    const { session } = account.account;
    if (session.actor !== actor || session.household !== household) return;
    const subscription = choreController(account.account, client, setView, () => {
      void Haptics.selectionAsync().catch(() => undefined);
    });
    const current = subscription.controller;
    runtime.current = current;
    void current.refresh();
    return () => {
      runtime.current = null;
      subscription.release();
    };
  }, [client, actor, household, account]);
  useFocusEffect(
    useCallback(() => {
      void runtime.current?.refresh();
    }, []),
  );
  return {
    view:
      account.status === "ready"
        ? view
        : {
            ...initialChoreView,
            error:
              account.status === "error"
                ? "Could not open saved chores. Try refreshing again."
                : null,
          },
    refresh: () => {
      if (account.status === "error") retry();
      else void runtime.current?.refresh();
    },
    complete: (chore: Chore, completedOn: string) =>
      runtime.current?.complete(chore, Crypto.randomUUID(), completedOn),
    skip: (chore: Chore) => runtime.current?.skip(chore, Crypto.randomUUID()),
    reschedule: (chore: Chore, date: string) =>
      runtime.current?.reschedule(chore, Crypto.randomUUID(), date),
    retryChange: () => runtime.current?.retryChange(),
    discard: (operation: string) => runtime.current?.discard(operation),
  };
}
