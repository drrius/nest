import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";
import { MealWeekSnapshot, MealWeekStart } from "@nest/contracts/meals";
import { fail, type Session } from "./contracts.ts";
import { scoped } from "./session.ts";
import type { Database, Transaction } from "./database.ts";
const codec = Schema.fromJsonString(MealWeekSnapshot);
const keys = (session: Session, weekStart: string) => [session.actor, session.household, weekStart];
async function read(tx: Transaction, session: Session, weekStart: string, repair = false) {
  const rows = await tx.all<{ data: string }>(
    "SELECT data FROM offline_meal_weeks WHERE actor=? AND household=? AND week_start=?",
    keys(session, weekStart),
  );
  if (!rows[0]) return null;
  const decoded = Schema.decodeUnknownExit(codec)(rows[0].data, { onExcessProperty: "error" });
  if (Exit.isFailure(decoded)) {
    if (repair) return null;
    fail("storage");
  }
  const result = decoded.value;
  if (result.householdId !== session.household || result.weekStart !== weekStart) {
    if (repair) return null;
    fail("invalid_input");
  }
  return result;
}
export function readMealWeek(database: Database, session: Session, weekStart: string) {
  if (!Schema.is(MealWeekStart)(weekStart)) fail("invalid_input");
  return scoped(database, session, (tx) => read(tx, session, weekStart));
}
export function saveMealWeek(
  database: Database,
  session: Session,
  snapshot: MealWeekSnapshot,
  current: () => boolean = () => true,
) {
  if (!Schema.is(MealWeekSnapshot)(snapshot) || snapshot.householdId !== session.household)
    fail("invalid_input");
  return scoped(database, session, async (tx) => {
    if (!current()) fail("cancelled");
    const previous = await read(tx, session, snapshot.weekStart, true);
    if (!current()) fail("cancelled");
    if (previous && BigInt(previous.revision) > BigInt(snapshot.revision)) return previous;
    await tx.run(
      "INSERT OR REPLACE INTO offline_meal_weeks(actor,household,week_start,data) VALUES(?,?,?,?)",
      [...keys(session, snapshot.weekStart), Schema.encodeSync(codec)(snapshot)],
    );
    await tx.run(
      `DELETE FROM offline_meal_weeks WHERE actor=? AND household=? AND rowid NOT IN
      (SELECT rowid FROM offline_meal_weeks WHERE actor=? AND household=? ORDER BY rowid DESC LIMIT 8)`,
      [session.actor, session.household, session.actor, session.household],
    );
    if (!current()) fail("cancelled");
    return snapshot;
  });
}
