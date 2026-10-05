import assert from "node:assert/strict";
import {
  contextBoundaryId as id,
  contextBoundaryFixture,
} from "./legacy-context-boundary-calls.mjs";

export function run(db, actor, sql, { setup = "", role = "authenticated" } = {}) {
  return db.sql(`begin; ${contextBoundaryFixture()} ${setup} set local role ${role};
    set local request.jwt.claim.sub='${actor === null ? "" : id(actor)}'; ${sql}; rollback;`);
}

export function denied(
  db,
  cases,
  { name, expression, reason, expected, actor = 1, setup = "", role },
) {
  assert.throws(() => run(db, actor, `select ${expression}`, { setup, role }), expected);
  cases.push({ function: name, actor, role: role ?? "authenticated", reason, denied: true });
}
