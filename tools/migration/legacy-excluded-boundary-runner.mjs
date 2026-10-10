import assert from "node:assert/strict";
import {
  excludedBoundaryId as id,
  excludedBoundaryFixture,
} from "./legacy-excluded-boundary-calls.mjs";
export function runExcludedBoundary(db, actor, sql, { setup = "", role = "authenticated" } = {}) {
  return db.sql(`begin; ${excludedBoundaryFixture()} ${setup} set local role ${role};
    set local request.jwt.claim.sub='${actor === null ? "" : id(actor)}'; ${sql}; rollback;`);
}
export function denyExcludedBoundary(
  db,
  cases,
  { name, expression, reason, expected, actor = 1, setup = "", role },
) {
  assert.throws(
    () => runExcludedBoundary(db, actor, `select ${expression}`, { setup, role }),
    expected,
  );
  cases.push({ function: name, actor, role: role ?? "authenticated", reason, denied: true });
}
