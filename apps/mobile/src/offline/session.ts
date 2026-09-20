import { pruneAcknowledged } from "./retention.ts";
import * as Schema from "effect/Schema";
import { Account, fail, type Session } from "./contracts.ts";
import type { Database, Transaction } from "./database.ts";

export async function activate(
  database: Database,
  account: Account,
  lease: string,
): Promise<Session> {
  if (!Schema.is(Account)(account) || !Schema.is(Schema.String.check(Schema.isUUID()))(lease))
    fail("invalid_input");
  return database.transaction(async (tx) => {
    await tx.run("DELETE FROM offline_session");
    await tx.run("INSERT INTO offline_session VALUES (1, ?, ?, ?)", [
      lease,
      account.actor,
      account.household,
    ]);
    const session = { ...account, lease };
    await pruneAcknowledged(tx, session);
    return session;
  });
}
export async function authorize(tx: Transaction, session: Session) {
  const rows = await tx.all(
    "SELECT 1 FROM offline_session WHERE lease = ? AND actor = ? AND household = ?",
    [session.lease, session.actor, session.household],
  );
  if (rows.length !== 1) fail("session_changed");
}
export function scoped<T>(
  database: Database,
  session: Session,
  body: (tx: Transaction) => Promise<T>,
) {
  return database.transaction(async (tx) => {
    await authorize(tx, session);
    return body(tx);
  });
}
export function suspend(database: Database, session: Session) {
  return scoped(database, session, (tx) => tx.run("DELETE FROM offline_session"));
}
