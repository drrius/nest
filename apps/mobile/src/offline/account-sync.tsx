import { useEffect } from "react";
import { AppState } from "react-native";
import { onNetwork, networkState } from "./network";
import * as Haptics from "expo-haptics";
import type { OfflineAccount } from "./owner";
import { reconnectSync } from "./reconnect";
import { choreController } from "../chores/controller";
import { groceryController } from "../groceries/controller";
import type { ChoreClient } from "../chores/client";
import type { GroceryClient } from "../groceries/client";
const queued = () => {
  void Haptics.selectionAsync().catch(() => undefined);
};
const ignore = () => undefined;
export function AccountSync({
  account,
  chores,
  groceries,
}: {
  account: OfflineAccount | null;
  chores: ChoreClient | null;
  groceries: GroceryClient | null;
}) {
  useEffect(() => {
    if (!account || !chores || !groceries) return;
    const chore = choreController(account, chores, ignore, queued);
    const grocery = groceryController(account, groceries, ignore, queued);
    const stop = reconnectSync({
      active: AppState.currentState === "active",
      onActivity: (listener) =>
        AppState.addEventListener("change", (state) => listener(state === "active")),
      onNetwork,
      network: networkState,
      refresh: async () => {
        await Promise.all([chore.controller.refresh(), grocery.controller.refresh()]);
      },
    });
    return () => {
      stop();
      chore.release();
      grocery.release();
    };
  }, [account, chores, groceries]);
  return null;
}
