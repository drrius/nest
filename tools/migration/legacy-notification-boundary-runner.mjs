import assert from "node:assert/strict";
import {
  notificationBoundaryId as id,
  notificationBoundaryFixture,
} from "./legacy-notification-boundary-calls.mjs";

export function runNotificationBoundary(
  db,
  actor,
  sql,
  { setup = "", role = "authenticated" } = {},
) {
  return db.sql(`begin; ${notificationBoundaryFixture()} ${setup} set local role ${role};
    set local request.jwt.claim.sub='${actor === null ? "" : id(actor)}'; ${sql}; rollback;`);
}
export function denyNotificationBoundary(
  db,
  cases,
  { name, expression, reason, expected, actor = 1, setup = "", role },
) {
  assert.throws(
    () => runNotificationBoundary(db, actor, `select ${expression}`, { setup, role }),
    expected,
  );
  cases.push({ function: name, actor, role: role ?? "authenticated", reason, denied: true });
}
