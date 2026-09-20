import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import { createRequire } from "node:module";
import { ReplaceMealInput } from "../../packages/contracts/src/meal-replacement.ts";
import { fixture, id, command } from "./meal-replacement-fixture.mjs";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));

test("replacement Effect and SQL agree on exact revision, UTF-16 title, date and hidden-key boundaries", (t) => {
  const f = fixture(t),
    input = f.input();
  const values = [
    null,
    [],
    "bad",
    {},
    ...Array.from({ length: 124 }, (_, n) => ({ ...input, title: (n % 2 ? "🥣" : "a").repeat(n) })),
  ];
  for (const patch of [
    { actorId: id(2) },
    { operationId: id(999) },
    { entryId: null },
    { entryId: "bad" },
    { expectedRevision: 0 },
    { expectedRevision: "01" },
    { expectedRevision: "9223372036854775805" },
    { expectedRevision: "9223372036854775806" },
    { expectedRevision: "9223372036854775808" },
    { date: "2030-01-14" },
    { date: "2030-02-30" },
    { slot: "snack" },
    { weekStart: "2030-01-08" },
    { title: "\t\n" },
  ])
    values.push({ ...input, ...patch });
  const expected = values.map(
    (value) =>
      Schema.decodeUnknownExit(ReplaceMealInput)(value, { onExcessProperty: "error" })._tag ===
      "Success",
  );
  f.db.sql(
    `create function private.fixture_replacement_valid(value jsonb) returns boolean language plpgsql as $$ begin perform private.nest_meal_replacement_input(value); return true; exception when others then return false; end $$`,
  );
  const actual = JSON.parse(
    f.db.sql(
      `select jsonb_agg(private.fixture_replacement_valid(value) order by ordinal) from jsonb_array_elements('${JSON.stringify(values).replaceAll("'", "''")}') with ordinality as items(value,ordinal)`,
    ),
  );
  assert.deepEqual(actual, expected);
});

test("simultaneous partner replacements accept one exact baseline and retain only one active result", async (t) => {
  const f = fixture(t),
    input = f.input();
  const results = await Promise.allSettled([
    f.db.concurrent(command(id(660), input)),
    f.db.concurrent(command(id(661), { ...input, title: "Partner soup" }, { actor: id(2) })),
  ]);
  assert.equal(results.filter((value) => value.status === "fulfilled").length, 1);
  assert.match(
    results.find((value) => value.status === "rejected").reason.stderr,
    /Meal week changed/,
  );
  assert.equal(f.db.sql("select count(*) from public.nest_meal_replacement_receipts"), "1");
  assert.equal(
    f.db.sql("select count(*) from public.meal_plan_entries where removed_at is null"),
    "1",
  );
});

test("legacy row-first contention rolls back every replacement effect and requires a fresh baseline", async (t) => {
  const f = fixture(t),
    input = f.input();
  const held = f.db.concurrent(
    `set application_name='replace-row-lock'; begin; select id from public.meal_plan_entries where id='${f.entry}' for update; select pg_sleep(0.7); update public.meal_plan_entries set title_snapshot='Partner edit' where id='${f.entry}'; commit`,
  );
  for (let attempt = 0; ; attempt++) {
    if (
      f.db.sql(
        "select count(*) from pg_stat_activity where application_name='replace-row-lock' and wait_event='PgSleep'",
      ) === "1"
    )
      break;
    assert.ok(attempt < 100);
    await setTimeout(5);
  }
  assert.throws(
    () => f.db.sql(`set lock_timeout='30ms'; ${command(id(670), input)}`),
    /Meal week changed/,
  );
  await held;
  assert.equal(f.db.sql("select count(*) from public.nest_meal_replacement_receipts"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_meal_removal_receipts"), "0");
  assert.equal(f.db.sql("select count(*) from public.nest_meal_placement_receipts"), "0");
  assert.throws(() => f.replace(id(670), input), /Meal week changed/);
  assert.equal(f.replace(id(670), f.input()).previousEntryId, f.entry);
});

test("repeatable snapshots cannot replace against stale dependent state", (t) => {
  const f = fixture(t),
    input = f.input(),
    before = f.snapshot();
  assert.throws(
    () => f.db.sql(`begin isolation level repeatable read; ${command(id(680), input)}; commit`),
    /Meal week changed/,
  );
  assert.deepEqual(f.snapshot(), before);
});
