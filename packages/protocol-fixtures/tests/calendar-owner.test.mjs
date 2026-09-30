import assert from "node:assert/strict";
import { test } from "node:test";
import { calendarOwner } from "../src/calendar/owner.ts";
test("calendar ownership starts once, disposes on last subscriber and recreates on strict-mode remount", () => {
  let created = 0,
    disposed = 0,
    started = 0,
    stopped = 0;
  const owner = calendarOwner(
    () => ({ id: ++created, dispose: () => disposed++ }),
    () => {
      started++;
      return () => stopped++;
    },
  );
  assert.equal(owner.getSnapshot(), null);
  const first = owner.subscribe(() => {}),
    second = owner.subscribe(() => {});
  assert.equal(created, 1);
  assert.equal(started, 1);
  first();
  assert.equal(disposed, 0);
  second();
  assert.equal(disposed, 1);
  assert.equal(stopped, 1);
  assert.equal(owner.getSnapshot(), null);
  const remount = owner.subscribe(() => {});
  assert.equal(owner.getSnapshot().id, 2);
  remount();
  assert.equal(disposed, 2);
});
