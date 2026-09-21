import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { PlannedRecipeEnvelope, ReadPlannedRecipe } from "@nest/contracts/recipe-selection";
import { fail, type Session } from "./contracts.ts";
import { scoped } from "./session.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(PlannedRecipeEnvelope);
const keys = (session: Session, target: ReadPlannedRecipe) => [
  session.actor,
  session.household,
  target.weekStart,
  target.entryId.toLowerCase(),
];
async function read(tx: Transaction, session: Session, target: ReadPlannedRecipe, repair = false) {
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM offline_planned_recipes WHERE actor=? AND household=? AND week_start=? AND entry_id=?",
    keys(session, target),
  );
  if (!rows[0]) return null;
  const decoded = Schema.decodeUnknownExit(codec)(rows[0].data, { onExcessProperty: "error" });
  if (Exit.isFailure(decoded)) {
    if (repair) return null;
    fail("storage");
  }
  const result = decoded.value;
  if (
    result.householdId !== session.household ||
    result.weekStart !== target.weekStart ||
    (result.entry !== null && result.entry.entryId !== target.entryId.toLowerCase())
  ) {
    if (repair) return null;
    fail("invalid_input");
  }
  return result;
}
export function readPlannedRecipe(database: Database, session: Session, target: ReadPlannedRecipe) {
  if (!Schema.is(ReadPlannedRecipe)(target)) fail("invalid_input");
  return scoped(database, session, (tx) => read(tx, session, target));
}
export interface PlannedRecipeCacheWrite {
  target: ReadPlannedRecipe;
  snapshot: PlannedRecipeEnvelope;
}
function valid(write: PlannedRecipeCacheWrite, session: Session) {
  return (
    Schema.is(ReadPlannedRecipe)(write.target) &&
    Schema.is(PlannedRecipeEnvelope)(write.snapshot) &&
    write.snapshot.householdId === session.household &&
    write.snapshot.weekStart === write.target.weekStart &&
    write.snapshot.revision === write.target.revision &&
    (write.snapshot.entry === null ||
      write.snapshot.entry.entryId === write.target.entryId.toLowerCase())
  );
}
export function savePlannedRecipe(
  database: Database,
  session: Session,
  write: PlannedRecipeCacheWrite,
  current: () => boolean = () => true,
) {
  if (!valid(write, session)) fail("invalid_input");
  const target = { ...write.target };
  const data = Schema.encodeSync(codec)(write.snapshot);
  const snapshot = Schema.decodeUnknownSync(codec)(data);
  return scoped(database, session, async (tx) => {
    if (!current()) fail("cancelled");
    const previous = await read(tx, session, target, true);
    if (!current()) fail("cancelled");
    if (previous && BigInt(previous.revision) > BigInt(snapshot.revision)) return previous;
    await tx.run(
      "INSERT OR REPLACE INTO offline_planned_recipes(actor,household,week_start,entry_id,data) VALUES(?,?,?,?,?)",
      [...keys(session, target), data],
    );
    await tx.run(
      `DELETE FROM offline_planned_recipes WHERE actor=? AND household=? AND rowid NOT IN
    (SELECT rowid FROM offline_planned_recipes WHERE actor=? AND household=? ORDER BY rowid DESC LIMIT 32)`,
      [session.actor, session.household, session.actor, session.household],
    );
    if (!current()) fail("cancelled");
    return snapshot;
  });
}
