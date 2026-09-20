import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Effect from "effect/Effect";
import { makeOfflineStore } from "../src/offline/service.ts";

export const account = {
  actor: "10000000-0000-4000-8000-000000000001",
  household: "20000000-0000-4000-8000-000000000001",
};
export const emptyTransfers = {
  version: 1,
  householdId: account.household,
  members: [{ actorId: account.actor, displayName: "A" }],
  transfers: [],
};
export const lease = "30000000-0000-4000-8000-000000000001";
export const target = "40000000-0000-4000-8000-000000000001";
export const operation = "50000000-0000-4000-8000-000000000001";
export const grocery = {
  operation,
  kind: "groceries.setChecked",
  target,
  expected: "v1",
  checked: true,
};
export const run = Effect.runPromise;
export function connect(path) {
  const connection = new DatabaseSync(path);
  let tail = Promise.resolve();
  const database = {
    transaction(body) {
      const result = tail.then(async () => {
        connection.exec("BEGIN IMMEDIATE");
        try {
          const value = await body({
            run: async (sql, values = []) => {
              connection.prepare(sql).run(...values);
            },
            all: async (sql, values = []) => connection.prepare(sql).all(...values),
          });
          connection.exec("COMMIT");
          return value;
        } catch (error) {
          connection.exec("ROLLBACK");
          throw error;
        }
      });
      tail = result.catch(() => {});
      return result;
    },
  };
  return { connection, database, idle: () => tail, store: makeOfflineStore(database) };
}
export async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "nest-offline-"));
  const path = join(dir, "offline.sqlite");
  let current = connect(path);
  t.after(async () => {
    current.connection.close();
    await rm(dir, { recursive: true, force: true });
  });
  await run(current.store.initialize);
  const session = await run(current.store.activate(account, lease));
  await run(
    current.store.saveSnapshot(session, [{ kind: grocery.kind, target, version: "v1", value: 0 }]),
  );
  return {
    ...current,
    path,
    session,
    reopen() {
      current.connection.close();
      current = connect(path);
      return current;
    },
  };
}
