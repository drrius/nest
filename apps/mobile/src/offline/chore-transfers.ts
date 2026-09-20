import * as Schema from "effect/Schema";
import { ChoreTransferList } from "@nest/contracts/chore-transfers";
import { fail, type Session } from "./contracts.ts";
import { scope } from "./journal.ts";
import type { Transaction } from "./database.ts";
export type TransferSnapshot = typeof ChoreTransferList.Type;
const codec = Schema.fromJsonString(ChoreTransferList);
function valid(snapshot: TransferSnapshot, session: Session) {
  return (
    snapshot.householdId === session.household &&
    snapshot.members.some((member) => member.actorId === session.actor)
  );
}
export async function saveTransfers(
  tx: Transaction,
  session: Session,
  snapshot: TransferSnapshot | null,
) {
  if (snapshot === null) {
    await tx.run(
      "DELETE FROM offline_chore_transfers WHERE actor=? AND household=?",
      scope(session),
    );
    return;
  }
  if (!Schema.is(ChoreTransferList)(snapshot) || !valid(snapshot, session)) fail("invalid_input");
  const data = Schema.encodeSync(codec)(snapshot);
  await tx.run(
    "INSERT INTO offline_chore_transfers VALUES (?,?,?) ON CONFLICT(actor,household) DO UPDATE SET data=excluded.data",
    [...scope(session), data],
  );
}
export async function readTransfers(tx: Transaction, session: Session) {
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM offline_chore_transfers WHERE actor=? AND household=?",
    scope(session),
  );
  if (!rows[0]) return null;
  const snapshot = Schema.decodeUnknownSync(codec)(rows[0].data, { onExcessProperty: "error" });
  if (!valid(snapshot, session)) fail("invalid_input");
  return snapshot;
}
