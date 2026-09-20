import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
import { MealWeekSnapshot, MealWeekStart } from "../../packages/contracts/src/meals.ts";
const decode = Schema.decodeUnknownSync(MealWeekSnapshot);
const entry = {
  entryId: "11111111-1111-4111-8111-111111111111",
  date: "2026-09-21",
  slot: "dinner",
  title: "Soup",
  recipeUrl: null,
  notes: null,
  definitionId: null,
  leftoverSourceId: null,
};
const week = {
  version: 1,
  householdId: "22222222-2222-4222-8222-222222222222",
  weekStart: "2026-09-21",
  revision: "9223372036854775807",
  entries: [entry],
};

test("week snapshots preserve legacy text and exact bigint revisions", () => {
  const stored = { ...entry, title: ` ${"🥣".repeat(120)} `, notes: "🥣".repeat(4000) };
  assert.deepEqual(decode({ ...week, entries: [stored] }), { ...week, entries: [stored] });
  assert.deepEqual(decode({ ...week, revision: "0", entries: [] }).entries, []);
  assert.equal(decode({ ...week, entries: [{ ...entry, title: "\t" }] }).entries[0].title, "\t");
});

test("malformed, out-of-week, duplicate and self-referencing meals fail closed", () => {
  for (const patch of [
    { date: "2026-09-20" },
    { date: "2026-09-28" },
    { date: "2026-02-30" },
    { slot: null },
    { slot: "snack" },
    { title: "   " },
    { title: "x".repeat(121) },
    { notes: "x".repeat(4001) },
    { recipeUrl: "x".repeat(2001) },
    { title: "\u0000" },
    { notes: "\ud800" },
    { leftoverSourceId: entry.entryId },
  ])
    assert.throws(() => decode({ ...week, entries: [{ ...entry, ...patch }] }));
  assert.throws(() => decode({ ...week, entries: [entry, { ...entry, slot: "lunch" }] }));
  assert.throws(() =>
    decode({ ...week, entries: [entry, { ...entry, entryId: week.householdId }] }),
  );
  for (const revision of [0, "-1", "01", "9223372036854775808", "1\n"]) {
    assert.throws(() => decode({ ...week, revision }));
  }
});

test("only complete Monday–Sunday weeks are accepted", () => {
  const start = Schema.decodeUnknownSync(MealWeekStart);
  for (const value of ["0001-01-01", "2026-09-21", "9999-12-20"]) assert.equal(start(value), value);
  for (const value of ["0000-01-03", "2026-09-22", "9999-12-27", "2026-09-21\n"]) {
    assert.throws(() => start(value));
  }
});
