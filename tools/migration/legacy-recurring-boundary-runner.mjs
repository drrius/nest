import assert from "node:assert/strict";
import {
  recurringBoundaryId as id,
  recurringBoundaryFixture,
} from "./legacy-recurring-boundary-calls.mjs";

export function runRecurringBoundary(db, actor, sql, { setup = "", role = "authenticated" } = {}) {
  return db.sql(`begin; ${recurringBoundaryFixture()} ${setup} set local role ${role};
    set local request.jwt.claim.sub='${actor === null ? "" : id(actor)}'; ${sql}; rollback;`);
}

export function denyRecurringBoundary(
  db,
  cases,
  { name, expression, reason, expected, actor = 1, setup = "", role },
) {
  assert.throws(
    () => runRecurringBoundary(db, actor, `select ${expression}`, { setup, role }),
    expected,
  );
  cases.push({ function: name, actor, role: role ?? "authenticated", reason, denied: true });
}
