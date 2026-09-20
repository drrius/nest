import { calendarOwner } from "./owner";
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { useOfflineAccount } from "../offline/provider";
import { onNetwork, networkState } from "../offline/network";
import { reconnectSync } from "../offline/reconnect";
import { expoCalendarPort } from "./expo-calendar";
import { makeCalendarReader } from "./service";
import { calendarOperations } from "./operations";
import { CalendarRuntime } from "./runtime";
const CalendarContext = createContext<CalendarRuntime | null>(null);
export function CalendarSharingProvider({ children }: PropsWithChildren) {
  const session = useSession(),
    offline = useOfflineAccount();
  const account = offline.state.status === "ready" ? offline.state.account : null,
    client = session.calendar;
  const owner = useMemo(
    () =>
      calendarOwner(
        () =>
          account && client
            ? new CalendarRuntime(
                calendarOperations(
                  client,
                  account,
                  makeCalendarReader(expoCalendarPort),
                  Crypto.randomUUID,
                ),
                Date.now,
              )
            : null,
        startRefresh,
      ),
    [account, client],
  );
  const value = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return <CalendarContext value={value}>{children}</CalendarContext>;
}
export const useCalendarSharing = () => useContext(CalendarContext);

function startRefresh(runtime: CalendarRuntime) {
  const refresh = async () => {
    await runtime.load();
    await runtime.refresh();
  };
  const stop = reconnectSync({
    active: AppState.currentState === "active",
    onActivity: (listener) =>
      AppState.addEventListener("change", (state) => listener(state === "active")),
    onNetwork,
    network: networkState,
    refresh,
  });
  const timer = setInterval(
    () => {
      if (AppState.currentState === "active") void refresh();
    },
    5 * 60 * 1000,
  );
  return () => {
    clearInterval(timer);
    stop();
  };
}
