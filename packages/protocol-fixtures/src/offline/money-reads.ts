import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { fail, type Session } from "./contracts.ts";
import { scoped } from "./session.ts";
import type { Database } from "./database.ts";
import {
  MoneyCacheEntry,
  MoneyCacheTarget,
  moneyEntryKey,
  moneyTargetKey,
} from "./money-contract.ts";
const codec = Schema.fromJsonString(MoneyCacheEntry);
function belongs(entry: MoneyCacheEntry, session: Session) {
  if (entry.value.householdId !== session.household) return false;
  if (entry.kind === "balance")
    return entry.value.members.some((member) => member.actorId === session.actor);
  if (entry.kind === "detail")
    return entry.value.shares.some((share) => share.memberId === session.actor);
  return true;
}
export function readMoney(database: Database, session: Session, target: MoneyCacheTarget) {
  const decoded = Schema.decodeUnknownExit(MoneyCacheTarget)(target, { onExcessProperty: "error" });
  if (Exit.isFailure(decoded)) fail("invalid_input");
  const key = moneyTargetKey(decoded.value);
  return scoped(database, session, async (tx) => {
    const rows = await tx.all<{ data: string }>(
      "SELECT data FROM offline_money_reads WHERE actor=? AND household=? AND kind=? AND target=?",
      [session.actor, session.household, target.kind, key],
    );
    if (!rows[0]) return null;
    const result = Schema.decodeUnknownExit(codec)(rows[0].data, { onExcessProperty: "error" });
    if (Exit.isFailure(result)) fail("storage");
    const entry = result.value;
    if (!belongs(entry, session) || entry.kind !== target.kind || moneyEntryKey(entry) !== key)
      fail("invalid_input");
    return entry;
  });
}
export function saveMoney(
  database: Database,
  session: Session,
  input: MoneyCacheEntry,
  current: () => boolean,
) {
  const decoded = Schema.decodeUnknownExit(MoneyCacheEntry)(input, { onExcessProperty: "error" });
  if (Exit.isFailure(decoded) || !belongs(decoded.value, session)) fail("invalid_input");
  const entry = decoded.value,
    key = moneyEntryKey(entry),
    data = Schema.encodeSync(codec)(entry);
  return scoped(database, session, async (tx) => {
    if (!current()) fail("cancelled");
    await tx.run(
      "INSERT OR REPLACE INTO offline_money_reads(actor,household,kind,target,data) VALUES(?,?,?,?,?)",
      [session.actor, session.household, entry.kind, key, data],
    );
    // Keep the first history page for the overview plus 19 most recently saved continuation pages.
    // Retention is local only: it cannot delete financial history on the server.
    const limit = entry.kind === "detail" ? 50 : 19;
    await tx.run(
      `DELETE FROM offline_money_reads WHERE actor=? AND household=? AND kind=? AND target<>'' AND rowid NOT IN
      (SELECT rowid FROM offline_money_reads WHERE actor=? AND household=? AND kind=? AND target<>'' ORDER BY rowid DESC LIMIT ?)`,
      [
        session.actor,
        session.household,
        entry.kind,
        session.actor,
        session.household,
        entry.kind,
        limit,
      ],
    );
    if (!current()) fail("cancelled");
    return entry;
  });
}
export function clearMoney(database: Database, session: Session) {
  return scoped(database, session, (tx) =>
    tx.run("DELETE FROM offline_money_reads WHERE actor=? AND household=?", [
      session.actor,
      session.household,
    ]),
  );
}
