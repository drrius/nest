import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import type { Chore } from "@nest/contracts/chores";
import { useOfflineAccount } from "../offline/provider";
import { choreFlow } from "./flow";
import type { ChoreClient } from "./client";
import { choreRuntime, initialChoreView } from "./runtime";

export function useChores(client: ChoreClient, actor: string, household: string) {
  const { state: account, retry } = useOfflineAccount();
  const [view, setView] = useState(initialChoreView);
  const runtime = useRef<ReturnType<typeof choreRuntime> | null>(null);
  useEffect(() => {
    if (account.status !== "ready") return;
    const { store, session } = account.account;
    if (session.actor !== actor || session.household !== household) return;
    const current = choreRuntime(choreFlow(store, session, client), setView, () => {
      void Haptics.selectionAsync().catch(() => undefined);
    });
    runtime.current = current;
    void current.refresh();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void current.refresh();
    });
    return () => {
      runtime.current = null;
      listener.remove();
      current.dispose();
    };
  }, [client, actor, household, account]);
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
    discard: (operation: string) => runtime.current?.discard(operation),
  };
}
