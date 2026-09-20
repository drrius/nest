import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useState,
  type PropsWithChildren,
} from "react";
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import { useSession } from "../session/provider";
import { expoDatabase } from "./expo-database";
import { offlineOwner, type OfflineState } from "./owner";
import { AccountSync } from "./account-sync";

async function open() {
  const connection = await SQLite.openDatabaseAsync("nest-offline.db", { useNewConnection: true });
  const database = expoDatabase(connection);
  return { database, idle: database.idle, close: () => connection.closeAsync() };
}
const OfflineContext = createContext<{ state: OfflineState; retry: () => void }>({
  state: { status: "loading" },
  retry: () => undefined,
});
export function OfflineProvider({ children }: PropsWithChildren) {
  const session = useSession();
  const member = session.state.status === "ready" ? session.state.member : null;
  const actor = member?.userId,
    household = member?.householdId;
  const [state, setState] = useState<OfflineState>({ status: "loading" });
  const [owner] = useState(() => offlineOwner(open, Crypto.randomUUID));
  useEffect(() => {
    let active = true;
    const current = owner;
    void current.select(actor && household ? { actor, household } : null, (next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
      void current.select(null);
    };
  }, [actor, household, owner]);
  const retry = useCallback(() => {
    void owner.select(actor && household ? { actor, household } : null, setState);
  }, [actor, household, owner]);
  const matches =
    state.status === "ready" &&
    state.account.session.actor === actor &&
    state.account.session.household === household;
  const value: OfflineState = state.status === "ready" && !matches ? { status: "loading" } : state;
  return (
    <OfflineContext value={{ state: value, retry }}>
      <AccountSync
        account={value.status === "ready" ? value.account : null}
        chores={session.chores}
        groceries={session.groceries}
      />
      {children}
    </OfflineContext>
  );
}
export const useOfflineAccount = () => useContext(OfflineContext);
