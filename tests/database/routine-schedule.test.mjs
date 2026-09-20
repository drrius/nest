import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  firstDueDateOnOrAfter,
  nextDueAfterClosure,
} from "../../packages/domain/src/routines/index.ts";
import { startFixturePostgres } from "./fixture-postgres.mjs";

function cases() {
  const dates = [
    "0001-01-01",
    "0099-12-31",
    "0100-02-28",
    "0400-02-29",
    "2024-02-29",
    "2026-12-31",
  ];
  for (let index = 0; index < 100; index++)
    dates.push(new Date(Date.UTC(1999 + index, index % 12, 28)).toISOString().slice(0, 10));
  return dates.flatMap((date) =>
    [
      { kind: "one_off", date },
      { kind: "daily" },
      { kind: "weekdays", days: [1, 3, 5] },
      { kind: "weekdays", days: [7] },
      { kind: "weekly", weekday: 2 },
      { kind: "biweekly", weekday: 1 },
      { kind: "monthly", dayOfMonth: 31 },
      { kind: "monthly", dayOfMonth: 1 },
      { kind: "after_completion", every: 3, unit: "days" },
      { kind: "after_completion", every: 2, unit: "weeks" },
    ].flatMap((rule) => [
      { rule, closedDueDate: date },
      { rule, closedDueDate: date, completedOn: "2026-09-20", originalDueDate: "2026-09-07" },
    ]),
  );
}

test("audited SQL and pure rules agree on 2,120 first dates and closure successors", () => {
  const db = startFixturePostgres();
  try {
    db.file(fileURLToPath(new URL("./legacy-routine-schedule.sql", import.meta.url)));
    const inputs = cases();
    assert.equal(inputs.length, 2120);
    // Only generated fixture values, never user data. Batches stay below argv limits.
    for (let start = 0; start < inputs.length; start += 100) {
      const batch = inputs.slice(start, start + 100);
      const encoded = JSON.stringify(batch).replaceAll("'", "''");
      const actual = JSON.parse(
        db.sql(`select jsonb_agg(jsonb_build_object(
        'first', private.first_routine_due_date(x->'rule', (x->>'closedDueDate')::date),
        'next', private.next_routine_due_date(x->'rule', (x->>'closedDueDate')::date,
          (x->>'completedOn')::date, (x->>'originalDueDate')::date)) order by ordinal)
        from jsonb_array_elements('${encoded}'::jsonb) with ordinality as inputs(x, ordinal)`),
      );
      assert.deepEqual(
        actual,
        batch.map((input) => ({
          first: firstDueDateOnOrAfter(input.rule, input.closedDueDate),
          next: nextDueAfterClosure(input),
        })),
        `parity batch ${start}`,
      );
    }
  } finally {
    db.stop();
  }
});
