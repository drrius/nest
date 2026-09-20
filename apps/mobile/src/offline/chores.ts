import * as Schema from "effect/Schema";
import { Chore } from "@nest/contracts/chores";
import { fail, type Session } from "./contracts.ts";
import type { Database } from "./database.ts";
import { scoped } from "./session.ts";
import { operations, scope } from "./journal.ts";

export function saveChores(database: Database, session: Session, chores: readonly Chore[]) {
  if (!Schema.is(Schema.Array(Chore))(chores) || chores.length > 200) fail("invalid_input");
  return scoped(database, session, async (tx) => {
    await tx.run("DELETE FROM offline_chores WHERE actor = ? AND household = ?", scope(session));
    await tx.run(
      "DELETE FROM offline_items WHERE actor = ? AND household = ? AND kind = 'chore.complete'",
      scope(session),
    );
    for (const chore of chores) {
      await tx.run("INSERT INTO offline_chores VALUES (?, ?, ?, ?, ?, ?)", [
        ...scope(session),
        chore.occurrenceId,
        chore.title,
        chore.dueDate,
        chore.assigneeId,
      ]);
      await tx.run("INSERT INTO offline_items VALUES (?, ?, 'chore.complete', ?, ?, 0)", [
        ...scope(session),
        chore.occurrenceId,
        chore.dueDate,
      ]);
    }
    await tx.run(
      "INSERT INTO offline_chore_sync VALUES (?, ?, 1) ON CONFLICT(actor, household) DO UPDATE SET loaded = 1",
      scope(session),
    );
  });
}
export function readChores(database: Database, session: Session) {
  return scoped(database, session, async (tx) => {
    const chores = await tx.all<Chore>(
      `SELECT target AS occurrenceId, title, due_date AS dueDate, assignee AS assigneeId
      FROM offline_chores WHERE actor = ? AND household = ? ORDER BY due_date, target`,
      scope(session),
    );
    const loaded = await tx.all(
      "SELECT 1 FROM offline_chore_sync WHERE actor = ? AND household = ?",
      scope(session),
    );
    const all = await operations(tx, session);
    const pending = all.filter(
      (row) => row.kind === "chore.complete" && row.status !== "acknowledged",
    );
    const completed = await tx.all<{ target: string }>(
      "SELECT target FROM offline_items WHERE actor = ? AND household = ? AND kind = 'chore.complete' AND value = 1",
      scope(session),
    );
    return {
      loaded: loaded.length === 1,
      chores: chores.map((chore) => ({
        ...chore,
        done:
          completed.some((row) => row.target === chore.occurrenceId) ||
          pending.some((row) => row.target === chore.occurrenceId && row.status === "pending"),
        pending: pending.some((row) => row.target === chore.occurrenceId),
      })),
      pending,
    };
  });
}
export function discardConflict(database: Database, session: Session, operation: string) {
  return scoped(database, session, async (tx) => {
    const rows = await operations(tx, session);
    const row = rows.find((item) => item.operation === operation);
    if (!row || row.status !== "conflict") fail("invalid_input");
    const remove = new Set([operation]);
    for (const item of rows)
      if (item.predecessor && remove.has(item.predecessor)) remove.add(item.operation);
    for (const id of remove) {
      await tx.run(
        "DELETE FROM offline_operations WHERE actor = ? AND household = ? AND operation = ?",
        [...scope(session), id],
      );
    }
  });
}
