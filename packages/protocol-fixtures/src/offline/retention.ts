import type { Session } from "./contracts.ts";
import type { Transaction } from "./database.ts";

export const unresolvedLimit = 1_000;
export const acknowledgedLimit = 1_000;

// Never remove unresolved work or the direct receipt needed to prepare its next wire.
// Older acknowledged ancestry may disappear: stale intents then conflict instead of
// being silently rebased. Server idempotency receipts are never pruned here.
export async function pruneAcknowledged(tx: Transaction, session: Session) {
  const scope = [session.actor, session.household];
  await tx.run(
    `DELETE FROM offline_operations AS old
     WHERE old.actor=? AND old.household=? AND old.status='acknowledged'
       AND old.sequence NOT IN (
         SELECT sequence FROM offline_operations
         WHERE actor=? AND household=? AND status='acknowledged'
         ORDER BY sequence DESC LIMIT ?
       )
       AND NOT EXISTS (
         SELECT 1 FROM offline_operations AS child
         WHERE child.actor=old.actor AND child.household=old.household
           AND child.predecessor=old.operation AND child.status<>'acknowledged'
       )`,
    [...scope, ...scope, acknowledgedLimit],
  );
}
