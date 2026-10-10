import * as Effect from "effect/Effect";
import { OfflineFailure, type Account, type Session } from "./contracts.ts";
import type { Database } from "./database.ts";
import { makeOfflineStore } from "./service.ts";

export interface OfflineConnection {
  database: Database;
  idle: () => Promise<void>;
  close: () => Promise<void>;
}
export interface OfflineAccount {
  store: ReturnType<typeof makeOfflineStore>;
  session: Session;
}
export type OfflineState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; account: OfflineAccount };
type Resource = OfflineConnection & {
  store: ReturnType<typeof makeOfflineStore>;
  session: Session | null;
};

// One native provider owns the lease across all household screens. Transitions wait
// for the previous open/close so delayed startup cannot replace a newer account.
export function offlineOwner(open: () => Promise<OfflineConnection>, lease: () => string) {
  let revision = 0;
  let resource: Resource | null = null;
  let tail = Promise.resolve();
  const release = async () => {
    if (!resource) return;
    const closing = resource;
    if (closing.session) {
      try {
        await Effect.runPromise(closing.store.suspend(closing.session));
      } catch (error) {
        if (!(error instanceof OfflineFailure) || error.reason !== "session_changed") throw error;
      }
      closing.session = null;
    }
    await closing.idle();
    await closing.close();
    resource = null;
  };
  const acquire = async (account: Account, current: () => boolean) => {
    const connection = await open();
    const store = makeOfflineStore(connection.database);
    resource = { ...connection, store, session: null };
    if (!current()) return;
    await Effect.runPromise(store.initialize);
    if (!current()) return;
    const session = await Effect.runPromise(store.activate(account, lease()));
    resource.session = session;
    return { store, session };
  };
  return {
    select(account: Account | null, publish: (state: OfflineState) => void = () => undefined) {
      const attempt = ++revision;
      const current = () => attempt === revision;
      if (account) publish({ status: "loading" });
      tail = tail
        .then(async () => {
          await release();
          if (!account || !current()) return;
          try {
            const opened = await acquire(account, current);
            if (current() && opened) publish({ status: "ready", account: opened });
            else await release();
          } catch (error) {
            await release();
            throw error;
          }
        })
        .catch(() => {
          if (account && current()) publish({ status: "error" });
        });
      return tail;
    },
  };
}
