import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { input, model, run, id } from "./meal-generation-fixture.mjs";
import { mealWeek } from "../../packages/domain/src/meal-week.ts";
const require = createRequire(new URL("../../packages/domain/package.json", import.meta.url));
const fc = require("fast-check");
const slots = ["breakfast", "lunch", "dinner"];
test("generated week proposals preserve arbitrary occupied slots across configured meal-slot combinations", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 5000 }),
      fc.subarray(slots, { minLength: 1 }),
      fc.array(fc.boolean(), { minLength: 21, maxLength: 21 }),
      async (offset, visible, occupied) => {
        const value = input();
        value.week.weekStart = new Date(Date.parse("2000-01-03T00:00:00Z") + offset * 604800000)
          .toISOString()
          .slice(0, 10);
        const days = mealWeek(value.week.weekStart);
        value.context.cooking.preferences.mealSlots = visible;
        value.week.entries = occupied.flatMap((present, index) =>
          present
            ? [
                {
                  entryId: id(700 + index),
                  date: days[Math.floor(index / 3)],
                  slot: slots[index % 3],
                  title: "Existing meal",
                  recipeUrl: null,
                  notes: null,
                  definitionId: null,
                  leftoverSourceId: null,
                },
              ]
            : [],
        );
        const original = structuredClone(value.week);
        const expected = days.flatMap((date, day) =>
          visible
            .filter((slot) => !occupied[day * 3 + slots.indexOf(slot)])
            .map((slot) => `${date}:${slot}`),
        );
        const f = model();
        if (!expected.length) {
          await assert.rejects(run(f, value), { reason: "week_full" });
          assert.equal(f.calls.length, 0);
        } else {
          const content = await run(f, value);
          assert.deepEqual(
            new Set(content.entries.map((entry) => `${entry.date}:${entry.slot}`)),
            new Set(expected),
          );
          assert.equal(f.calls.length, 2);
        }
        assert.deepEqual(value.week, original);
      },
    ),
    { seed: 20260921, numRuns: 100 },
  );
});
