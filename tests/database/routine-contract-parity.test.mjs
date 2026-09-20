import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { RoutineDefinition } from "../../packages/contracts/src/routines.ts";
import { startFixturePostgres } from "./fixture-postgres.mjs";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const base = { title: "Clean", schedule: { kind: "daily" }, assignment: { policy: "shared" } };
function definitions() {
  const result = [base, null, [], {}, { ...base, note: "excluded" }];
  for (const title of [
    "",
    " ",
    "\u00a0\ufeff",
    "a".repeat(120),
    "a".repeat(121),
    "🧹".repeat(60),
    "🧹".repeat(61),
    "Café",
  ])
    result.push({ ...base, title });
  for (const value of [null, true, false, "1", 0, 1, 1.5, 7, 8, 31, 32, 2147483647, 2147483648]) {
    for (const kind of ["weekly", "biweekly"])
      result.push({ ...base, schedule: { kind, weekday: value } });
    result.push({ ...base, schedule: { kind: "monthly", dayOfMonth: value } });
    for (const unit of ["days", "weeks", "months", null, true])
      result.push({ ...base, schedule: { kind: "after_completion", every: value, unit } });
    result.push({ ...base, schedule: { kind: "weekdays", days: [value] } });
  }
  for (const date of [
    "0001-01-01",
    "0000-01-01",
    "0004-02-29",
    "0100-02-29",
    "2026-02-30",
    "2026-01-01\n",
    null,
  ])
    result.push({ ...base, schedule: { kind: "one_off", date } });
  for (const days of [[], [1, 1], [7, 1, 3], [1, 2, 3, 4, 5, 6, 7], null, "1"])
    result.push({ ...base, schedule: { kind: "weekdays", days } });
  return result;
}

test("routine SQL validation agrees with strict Effect decoding on representable boundary inputs", () => {
  const db = startFixturePostgres();
  try {
    db.file("tests/database/routine-creation-fixture.sql");
    db.file("supabase/migrations/20260920082522_native_routine_creation.sql");
    db.sql(`create function private.fixture_valid_definition(value jsonb) returns boolean language plpgsql as $$
      begin perform private.nest_routine_definition(value,'00000000-0000-4000-8000-000000000010'); return true;
      exception when sqlstate '22023' then return false; end $$`);
    const inputs = definitions();
    const expected = inputs.map((input) => {
      try {
        Schema.decodeUnknownSync(RoutineDefinition)(input, { onExcessProperty: "error" });
        return true;
      } catch {
        return false;
      }
    });
    const encoded = JSON.stringify(inputs).replaceAll("'", "''");
    const actual = JSON.parse(
      db.sql(`select jsonb_agg(private.fixture_valid_definition(x) order by n)
      from jsonb_array_elements('${encoded}'::jsonb) with ordinality as inputs(x,n)`),
    );
    assert.deepEqual(actual, expected);
    assert.equal(inputs.length, 143);
  } finally {
    db.stop();
  }
});
