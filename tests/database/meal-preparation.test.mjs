import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { MealPreparationReceipt } from "../../packages/contracts/src/meal-preparation.ts";
import { fixture, id, as } from "./meal-preparation-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const decode = (value) =>
  Schema.decodeUnknownSync(MealPreparationReceipt)(value, { onExcessProperty: "error" });
test("preparation creation is atomic and concurrent retries return one linked one-off task", async (t) => {
  const f = fixture(t),
    input = f.input(),
    operation = id(900);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(as(f.command(operation, input)))),
  );
  const receipt = decode(JSON.parse(results[0].stdout));
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), receipt);
  assert.equal(receipt.revision, input.expectedRevision);
  assert.equal(receipt.entryId, input.entryId);
  assert.equal(receipt.dueOn, input.preparation.dueOn);
  assert.equal(
    f.db.sql(
      `select count(*) from public.routine_occurrences where meal_plan_entry_id='${input.entryId}'`,
    ),
    "1",
  );
  const routine = JSON.parse(
    f.db.sql(`select to_jsonb(t) from public.routines t where id='${receipt.routineId}'`),
  );
  assert.equal(routine.schedule_kind, "one_off");
  assert.equal(routine.priority, "meal_deadline");
  assert.equal(routine.instructions, "Use cold water");
  assert.equal(routine.active_from, receipt.dueOn);
  assert.equal(routine.active_until, receipt.dueOn);
  assert.equal(f.db.sql("select count(*) from public.nest_meal_preparation_receipts"), "1");
});
test("later completion preserves retry receipts and forbids a second preparation task", (t) => {
  const f = fixture(t),
    input = f.input(),
    receipt = f.create(id(901), input);
  f.db.sql(
    as(
      `select public.complete_occurrence('${receipt.occurrenceId}','fixture-complete','2030-01-06')`,
    ),
  );
  assert.deepEqual(f.create(id(901), input), receipt);
  assert.throws(() => f.create(id(902), input), /already has preparation/);
  f.remove(id(903), f.baseline(input.entryId));
  assert.deepEqual(f.create(id(901), input), receipt);
  assert.equal(
    f.db.sql(`select status from public.routine_occurrences where id='${receipt.occurrenceId}'`),
    "completed",
  );
});
test("receipt failure rolls back every inserted preparation row and leaves the meal unchanged", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  f.db.sql(
    `create function private.reject_prep_receipt() returns trigger language plpgsql as $$ begin raise exception 'Injected receipt failure'; end $$; create trigger reject_prep_receipt before insert on public.nest_meal_preparation_receipts for each row execute function private.reject_prep_receipt()`,
  );
  assert.throws(() => f.create(id(904)), /Injected receipt failure/);
  assert.equal(f.snapshot(), before);
});
test("stale, foreign, removed and malformed preparations cannot mutate household work", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  for (const patch of [
    { actorId: id(2) },
    { expectedRevision: "0" },
    { entryId: id(999) },
    {
      preparation: {
        ...f.input().preparation,
        assignment: { policy: "assigned", memberId: id(3) },
      },
    },
    { preparation: { ...f.input().preparation, instructions: "x".repeat(4001) } },
    { preparation: { ...f.input().preparation, dueOn: "2030-02-29" } },
  ])
    assert.throws(() => f.create(id(905), f.input(patch)), /Invalid|invalid|changed/);
  assert.equal(f.snapshot(), before);
  assert.throws(() => f.create(id(906), f.input(), id(3)), /authorized/);
  f.remove(id(907), f.baseline(f.meal.entryId));
  assert.throws(() => f.create(id(908), f.input(f.baseline(f.meal.entryId))), /Meal changed/);
});
test("preparation receipt RLS and current membership protect private retry history", (t) => {
  const f = fixture(t),
    input = f.input(),
    receipt = f.create(id(909));
  assert.equal(f.db.sql(as("select count(*) from public.nest_meal_preparation_receipts")), "1");
  for (const actor of [id(2), id(3)])
    assert.equal(
      f.db.sql(as("select count(*) from public.nest_meal_preparation_receipts", actor)),
      "0",
    );
  assert.throws(
    () =>
      f.create(id(909), { ...input, preparation: { ...input.preparation, title: "Different" } }),
    /operation changed/,
  );
  // Disposable legacy fixture activity FK must be cleared before revoking membership.
  f.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.throws(() => f.create(id(909)), /authorized/);
  assert.equal(
    f.db.sql(`select count(*) from public.routine_occurrences where id='${receipt.occurrenceId}'`),
    "1",
  );
});
test("create versus remove cannot leave open preparation linked to a removed meal", async (t) => {
  const f = fixture(t);
  for (let n = 0; n < 10; n++) {
    const meal = f.add(1000 + n),
      input = f.input(meal);
    const create = f.db.concurrent(as(f.command(id(1100 + n), input)));
    const remove = f.db.concurrent(
      as(`select public.nest_remove_meal('${id(10)}','${id(1200 + n)}','${JSON.stringify(meal)}')`),
    );
    const results = await Promise.allSettled([create, remove]);
    assert.ok(results.some((result) => result.status === "fulfilled"));
    assert.equal(
      f.db.sql(
        `select count(*) from public.routine_occurrences o join public.meal_plan_entries e on e.id=o.meal_plan_entry_id where e.removed_at is not null and o.status='open'`,
      ),
      "0",
    );
    const linked = Number(
      f.db.sql(
        `select count(*) from public.routine_occurrences where meal_plan_entry_id='${meal.entryId}'`,
      ),
    );
    assert.ok(linked <= 1);
    assert.equal(linked, results[0].status === "fulfilled" ? 1 : 0);
  }
});
test("two different requests cannot create two linked preparation tasks", async (t) => {
  const f = fixture(t),
    input = f.input();
  const results = await Promise.allSettled(
    [id(910), id(911)].map((operation) => f.db.concurrent(as(f.command(operation, input)))),
  );
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(f.db.sql("select count(*) from public.nest_meal_preparation_receipts"), "1");
  assert.equal(
    f.db.sql(
      `select count(*) from public.routine_occurrences where meal_plan_entry_id='${input.entryId}'`,
    ),
    "1",
  );
});
test("preparation storage preserves null/empty instructions and enforces UTF-16 bounds", (t) => {
  const f = fixture(t);
  const values = [
    null,
    "",
    "🍲".repeat(2000),
    "🍲".repeat(2000) + "x",
    "x".repeat(4000),
    "x".repeat(4001),
  ];
  for (const [index, instructions] of values.entries()) {
    const meal = f.add(1400 + index),
      value = f.input({ ...meal, preparation: { ...f.input().preparation, instructions } });
    if (instructions !== null && instructions.length > 4000) {
      assert.throws(() => f.create(id(1500 + index), value), /Invalid preparation instructions/);
    } else {
      const saved = decode(f.create(id(1500 + index), value));
      const stored = JSON.parse(
        f.db.sql(
          `select jsonb_build_object('instructions',instructions) from public.routines where id='${saved.routineId}'`,
        ),
      );
      assert.equal(stored.instructions, instructions);
    }
  }
});
test("anonymous calls, direct receipts and stale transaction snapshots cannot create preparation", (t) => {
  const f = fixture(t),
    before = f.snapshot();
  assert.throws(
    () => f.db.sql(`set role anon; ${f.command(id(920), f.input())}`),
    /permission denied/,
  );
  assert.throws(
    () => f.db.sql(as("insert into public.nest_meal_preparation_receipts default values")),
    /permission denied/,
  );
  assert.throws(
    () =>
      f.db.sql(
        `begin isolation level repeatable read; ${as(f.command(id(921), f.input()))}; commit`,
      ),
    /current snapshot/,
  );
  assert.equal(f.snapshot(), before);
});
