import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, id, as } from "./meal-ingredients-fixture.mjs";
test("reviewed ingredients preserve separate text and provenance, exclude pantry rows and replay immutably", (t) => {
  const f = fixture(t),
    selected = f
      .input()
      .selected.slice(0, 1)
      .map((i) => ({ ...i, quantity: "½ + 1", unit: "🥕".repeat(80) }));
  assert.ok(selected.length);
  const saved = f.add(id(900), f.input({ selected }));
  const item = saved.ingredients[0];
  assert.equal(item.outcome, "added");
  const row = JSON.parse(
    f.db.sql(`select to_jsonb(g) from public.grocery_items g where id='${item.itemId}'`),
  );
  assert.equal(row.quantity, "½ + 1");
  assert.equal(row.unit, "🥕".repeat(80));
  assert.equal(row.originating_meal_plan_entry_id, f.placed.entryId);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_ingredient_additions"), "1");
  f.db.sql(
    `update public.grocery_items set quantity='partner correction',state='removed' where id='${item.itemId}'`,
  );
  assert.deepEqual(f.add(id(900), f.input({ selected })), saved);
  assert.equal(
    f.db.sql(`select quantity from public.grocery_items where id='${item.itemId}'`),
    "partner correction",
  );
});
test("two members adding the same retained sources converge without overwriting either grocery", async (t) => {
  const f = fixture(t),
    value = f.input();
  const results = await Promise.all([
    f.db.concurrent(f.command(id(900), value)),
    f.db.concurrent(
      f.command(
        id(901),
        {
          ...value,
          selected: value.selected.map((item) => ({ ...item, quantity: "Partner amount" })),
        },
        { actor: id(2) },
      ),
    ),
  ]);
  const [first, second] = results.map((r) => JSON.parse(r.stdout));
  assert.deepEqual(
    first.ingredients.map((i) => i.itemId),
    second.ingredients.map((i) => i.itemId),
  );
  assert.equal(
    f.db.sql("select count(*) from private.nest_meal_ingredient_additions"),
    String(value.selected.length),
  );
  assert.equal(
    new Set([...first.ingredients, ...second.ingredients].map((i) => i.outcome)).size,
    2,
  );
  const winner = [first, second].find((result) => result.ingredients[0].outcome === "added");
  assert.equal(
    f.db.sql(
      `select quantity from public.grocery_items where id='${winner.ingredients[0].itemId}'`,
    ),
    winner.actorId === id(2) ? "Partner amount" : value.selected[0].quantity,
  );
});
test("foreign, stale, malformed and leftover source selections cannot add groceries", (t) => {
  const f = fixture(t),
    value = f.input();
  assert.throws(() => f.add(id(900), value, { actor: id(3) }), /authorized/);
  assert.throws(() => f.add(id(900), { ...value, expectedRevision: "0" }), /changed/);
  for (const selected of [
    [],
    [value.selected[0], value.selected[0]],
    [{ ...value.selected[0], name: "forged" }],
    [{ ...value.selected[0], entryId: id(999) }],
  ])
    assert.throws(() => f.add(id(900), { ...value, selected }), /Invalid|Duplicate|changed/);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_ingredient_additions"), "0");
  assert.throws(
    () => f.db.sql(as("select * from private.nest_meal_ingredient_receipts")),
    /permission/,
  );
});

test("ingredient receipt failure rolls back every grocery and source mapping", (t) => {
  const f = fixture(t),
    before = f.db.sql("select count(*) from public.grocery_items");
  f.db.sql(
    `create function private.reject_ingredient_receipt() returns trigger language plpgsql as $$ begin raise exception 'Injected failure'; end $$; create trigger reject_ingredient_receipt before insert on private.nest_meal_ingredient_receipts for each row execute function private.reject_ingredient_receipt()`,
  );
  assert.throws(() => f.add(id(900)), /Injected failure/);
  assert.equal(f.db.sql("select count(*) from public.grocery_items"), before);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_ingredient_additions"), "0");
});

test("current library changes cannot replace retained ingredient content and revoked retries are denied", (t) => {
  const f = fixture(t),
    original = f.snapshot.recipe.ingredients[0];
  f.db.sql(
    `update public.meal_grocery_templates set name='Later library edit',quantity='99',unit='kg' where id='${original.ingredientId}'`,
  );
  const saved = f.add(id(900));
  assert.equal(
    f.db.sql(`select name from public.grocery_items where id='${saved.ingredients[0].itemId}'`),
    original.name.trim(),
  );
  f.db.sql(
    `delete from public.activity_events; delete from public.household_members where user_id='${id(1)}'`,
  );
  assert.throws(() => f.add(id(900)), /authorized/);
});

test("leftover meals cannot materialize another purchase and stale later sources roll back earlier rows", (t) => {
  const f = fixture(t),
    value = f.input();
  const invalid = { ...value.selected[0], entryId: id(999) };
  assert.throws(
    () => f.add(id(900), { ...value, selected: [value.selected[0], invalid] }),
    /changed/,
  );
  assert.equal(f.db.sql("select count(*) from private.nest_meal_ingredient_additions"), "0");
  f.db.sql(
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot,leftover_of_entry_id) values('${id(801)}','${id(10)}','2030-01-08','dinner','Leftovers','${f.placed.entryId}')`,
  );
  const revision = f.db.sql(
    `select revision from public.nest_meal_week_revisions where household_id='${id(10)}' and week_start='${value.weekStart}'`,
  );
  assert.throws(
    () =>
      f.add(id(900), {
        ...value,
        expectedRevision: revision,
        selected: [{ ...value.selected[0], entryId: id(801) }],
      }),
    /changed/,
  );
});

test("concurrent retries of one operation return the same complete receipt", async (t) => {
  const f = fixture(t);
  const results = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(f.command(id(900)))),
  );
  const saved = JSON.parse(results[0].stdout);
  for (const result of results) assert.deepEqual(JSON.parse(result.stdout), saved);
  assert.equal(f.db.sql("select count(*) from private.nest_meal_ingredient_receipts"), "1");
  assert.throws(
    () => f.add(id(900), f.input({ selected: f.input().selected.slice(0, 1) })),
    /operation changed/,
  );
});
