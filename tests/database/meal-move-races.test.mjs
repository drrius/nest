import assert from "node:assert/strict";
import { test, after } from "node:test";
import { fixture, id, as, week, command } from "./meal-move-fixture.mjs";
const { db, add, input, revision } = fixture();
after(() => db.stop());
test("concurrent identical moves share one receipt and advance both weeks once", async () => {
  const entry = add(700).entryId,
    value = input(entry);
  const results = await Promise.all(
    Array.from({ length: 5 }, () => db.concurrent(command(id(701), value))),
  );
  const saved = JSON.parse(results[0].stdout);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  assert.equal(revision(week), (BigInt(value.expectedSourceRevision) + 1n).toString());
  assert.equal(revision(value.targetWeekStart), "1");
  assert.equal(db.sql("select count(*) from public.nest_meal_move_receipts"), "1");
});
test("opposite-direction moves serialize both baselines with one winner", async () => {
  const a = add(710).entryId,
    b = add(711).entryId;
  db.sql(`update public.meal_plan_entries set date='2030-01-21' where id='${b}'`);
  const left = input(a, "2030-01-21"),
    right = { ...input(b, week, "2030-01-21"), slot: "dinner" };
  const results = await Promise.allSettled([
    db.concurrent(command(id(712), left)),
    db.concurrent(command(id(713), right, { actor: id(2) })),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(String(results.find((r) => r.status === "rejected").reason), /Meal week changed/);
  assert.equal(revision(week), (BigInt(left.expectedSourceRevision) + 1n).toString());
  assert.equal(revision("2030-01-21"), (BigInt(left.expectedTargetRevision) + 1n).toString());
});
test("repeatable snapshots reject new moves; revoked members cannot replay receipts", () => {
  const f = fixture();
  try {
    const entry = f.add(720).entryId,
      value = f.input(entry);
    assert.throws(
      () => f.db.sql(`begin isolation level repeatable read; ${command(id(721), value)}; commit`),
      /Meal week changed/,
    );
    assert.equal(f.revision(week), value.expectedSourceRevision);
    const saved = f.move(id(721), value);
    assert.equal(saved.entryId, entry);
    f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
    assert.throws(() => f.move(id(721), value), /Not authorized/);
    assert.equal(f.db.sql(as("select count(*) from public.nest_meal_move_receipts")), "0");
  } finally {
    f.db.stop();
  }
});
