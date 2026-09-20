import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as SQLite from "expo-sqlite";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import * as Effect from "effect/Effect";
import type { Chore } from "@nest/contracts/chores";
import { expoDatabase } from "../offline/expo-database";
import { makeOfflineStore } from "../offline/service";
import type { Session } from "../offline/contracts";
import { choreFlow } from "./flow";
import type { ChoreClient } from "./client";
import { choreRuntime, initialChoreView } from "./runtime";

function openFlow(
  client: ChoreClient,
  actor: string,
  household: string,
  publish: Parameters<typeof choreRuntime>[1],
) {
  let disposed = false;
  let runtime: ReturnType<typeof choreRuntime> | null = null;
  let connection: SQLite.SQLiteDatabase | null = null;
  let database: ReturnType<typeof expoDatabase> | null = null;
  let store: ReturnType<typeof makeOfflineStore> | null = null;
  let session: Session | null = null;
  const start = (async () => {
    connection = await SQLite.openDatabaseAsync("nest-offline.db", { useNewConnection: true });
    database = expoDatabase(connection);
    store = makeOfflineStore(database);
    await Effect.runPromise(store.initialize);
    if (disposed) return;
    session = await Effect.runPromise(store.activate({ actor, household }, Crypto.randomUUID()));
    if (disposed) return;
    runtime = choreRuntime(choreFlow(store, session, client), publish, () => {
      void Haptics.selectionAsync().catch(() => undefined);
    });
    await runtime.refresh();
  })().catch(() => {
    if (!disposed)
      publish({
        ...initialChoreView,
        error: "Could not open saved chores. Return to your account and try again.",
      });
  });
  return {
    refresh: () => {
      void runtime?.refresh();
    },
    complete: (chore: Chore, operation: string, completedOn: string) =>
      runtime?.complete(chore, operation, completedOn),
    discard: (operation: string) => runtime?.discard(operation),
    dispose() {
      disposed = true;
      runtime?.dispose();
      void start
        .then(async () => {
          if (store && session)
            await Effect.runPromise(store.suspend(session)).catch(() => undefined);
          await database?.idle();
          await connection?.closeAsync();
        })
        .catch(() => undefined);
    },
  };
}
export function useChores(client: ChoreClient, actor: string, household: string) {
  const [view, setView] = useState(initialChoreView);
  const runtime = useRef<ReturnType<typeof openFlow> | null>(null);
  useEffect(() => {
    const current = openFlow(client, actor, household, setView);
    runtime.current = current;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") current.refresh();
    });
    return () => {
      runtime.current = null;
      listener.remove();
      current.dispose();
    };
  }, [client, actor, household]);
  return {
    view,
    refresh: () => runtime.current?.refresh(),
    complete: (chore: Chore, completedOn: string) =>
      runtime.current?.complete(chore, Crypto.randomUUID(), completedOn),
    discard: (operation: string) => runtime.current?.discard(operation),
  };
}
