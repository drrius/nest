import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { OfflineFailure, type Account, type Item, type Session } from "./contracts.ts";
import { initialize, type Database } from "./database.ts";
import * as Journal from "./journal.ts";
import * as Replay from "./replay.ts";
import * as SessionStore from "./session.ts";

function run<A>(body: () => Promise<A>) {
  return Effect.tryPromise({
    try: body,
    catch: (cause) =>
      Schema.is(OfflineFailure)(cause) ? cause : new OfflineFailure({ reason: "storage" }),
  });
}
export function makeOfflineStore(database: Database) {
  return {
    initialize: run(() => initialize(database)),
    activate: (account: Account, lease: string) =>
      run(() => SessionStore.activate(database, account, lease)),
    suspend: (session: Session) => run(() => SessionStore.suspend(database, session)),
    enqueue: (session: Session, intent: unknown) =>
      run(() => Journal.enqueue(database, session, intent)),
    read: (session: Session) => run(() => Journal.read(database, session)),
    saveSnapshot: (session: Session, items: readonly Item[]) =>
      run(() => Journal.saveSnapshot(database, session, items)),
    prepare: (session: Session) => run(() => Replay.prepare(database, session)),
    acknowledge: (session: Session, receipt: Replay.Receipt) =>
      run(() => Replay.acknowledge(database, session, receipt)),
    conflict: (
      session: Session,
      operation: string,
      reason: "changed" | "removed" | "access_revoked",
    ) => run(() => Replay.conflict(database, session, operation, reason)),
  };
}
export class OfflineStore extends Context.Service<
  OfflineStore,
  ReturnType<typeof makeOfflineStore>
>()("nest/OfflineStore") {}
export const offlineLayer = (database: Database) =>
  Layer.succeed(OfflineStore, makeOfflineStore(database));
