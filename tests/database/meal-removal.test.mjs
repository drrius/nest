import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fixture, id, as, week, command } from "./meal-removal-fixture.mjs";
const { db, add, preparation, baseline, remove } = fixture();
after(() => db.stop());
const entry = (n) =>
  JSON.parse(db.sql(`select row_to_json(e) from public.meal_plan_entries e where id='${id(n)}'`));
test("removal retains history and immutable actor-bound receipt after later partner restoration", () => {
  const input = add(400),
    before = entry(400);
  const receipt = remove(id(401), input);
  assert.equal(receipt.revision, String(BigInt(input.expectedRevision) + 1n));
  assert.equal(receipt.skippedPreparationId, null);
  const after = entry(400);
  assert.ok(after.removed_at);
  for (const field of [
    "title_snapshot",
    "notes",
    "meal_definition_id",
    "groceries_materialized_at",
  ])
    assert.equal(after[field], before[field]);
  db.sql(
    `update public.meal_plan_entries set removed_at=null,title_snapshot='Partner revision' where id='${id(400)}'`,
  );
  assert.deepEqual(remove(id(401), input), receipt);
  assert.equal(entry(400).title_snapshot, "Partner revision");
  assert.equal(entry(400).removed_at, null);
  assert.throws(
    () => remove(id(401), { ...input, expectedRevision: receipt.revision }),
    /Meal operation changed/,
  );
  assert.throws(() => remove(id(401), input, { actor: id(2) }), /Meal week changed/);
});
test("actual one-off preparation is skipped once while closed history and reminders are retained", () => {
  const input = add(410),
    occurrence = preparation(input.entryId, id(411));
  db.sql(`insert into public.routine_reminder_preferences(routine_id,household_id,member_id,enabled)
    select routine_id,'${id(10)}','${id(2)}',true from public.routine_occurrences where id='${occurrence}';
    select private.create_reminder_candidates_for_occurrence('${occurrence}')`);
  const receipt = remove(id(412), input);
  assert.equal(receipt.skippedPreparationId, occurrence);
  assert.equal(
    db.sql(
      `select status||':'||coalesce(role,'closed') from public.routine_occurrences where id='${occurrence}'`,
    ),
    "skipped:closed",
  );
  assert.equal(
    db.sql(
      `select count(*) from public.routine_occurrences where routine_id=(select routine_id from public.routine_occurrences where id='${occurrence}') and status='open'`,
    ),
    "0",
  );
  assert.equal(
    db.sql(
      `select count(*) from public.reminder_candidates where occurrence_id='${occurrence}' and status='pending'`,
    ),
    "0",
  );
  assert.deepEqual(remove(id(412), input), receipt);
});
test("already completed preparation survives meal removal unchanged", () => {
  const input = add(420),
    occurrence = preparation(input.entryId, id(421));
  db.sql(
    as(
      `select public.complete_occurrence('${occurrence}','complete-before-remove','${week}',null,null)`,
    ),
  );
  const before = db.sql(
    `select row_to_json(c) from public.routine_completions c where occurrence_id='${occurrence}'`,
  );
  assert.equal(remove(id(422), input).skippedPreparationId, null);
  assert.equal(
    db.sql(
      `select row_to_json(c) from public.routine_completions c where occurrence_id='${occurrence}'`,
    ),
    before,
  );
});
test("stale, foreign, malformed and active-leftover removals fail without side effects", () => {
  const input = add(430);
  assert.throws(() => remove(id(431), input, { household: id(20) }), /Not authorized/);
  assert.throws(() => remove(id(431), { ...input, extra: true }), /Invalid meal removal/);
  assert.throws(() => remove(id(431), { ...input, entryId: id(999) }), /Meal week changed/);
  db.sql(
    `insert into public.meal_plan_entries(household_id,date,slot,title_snapshot,leftover_of_entry_id) values('${id(10)}','2030-01-14',null,'Leftovers','${id(430)}')`,
  );
  assert.throws(() => remove(id(431), baseline(input.entryId)), /Meal week changed/);
  assert.equal(entry(430).removed_at, null);
  assert.equal(
    db.sql(
      `select count(*) from public.nest_meal_removal_receipts where operation_id='${id(431)}'`,
    ),
    "0",
  );
});
test("concurrent identical removal returns one receipt and one revision change", async () => {
  const input = add(440);
  const results = await Promise.all(
    Array.from({ length: 5 }, () => db.concurrent(command(id(441), input))),
  );
  for (const result of results) assert.equal(result.stdout, results[0].stdout);
  assert.equal(
    baseline(input.entryId).expectedRevision,
    String(BigInt(input.expectedRevision) + 1n),
  );
});
test("receipt failure rolls back meal, preparation, reminders and closure receipt", () => {
  const input = add(450),
    occurrence = preparation(input.entryId, id(451));
  db.sql(`insert into public.routine_reminder_preferences(routine_id,household_id,member_id,enabled)
    select routine_id,'${id(10)}','${id(2)}',true from public.routine_occurrences where id='${occurrence}';
    select private.create_reminder_candidates_for_occurrence('${occurrence}')`);
  const state = () =>
    db.sql(
      `select jsonb_build_object('meal',(select to_jsonb(e) from public.meal_plan_entries e where id='${input.entryId}'),'occurrence',(select to_jsonb(o) from public.routine_occurrences o where id='${occurrence}'),'receipts',(select jsonb_agg(to_jsonb(r) order by idempotency_key) from public.routine_command_receipts r),'reminders',(select jsonb_agg(to_jsonb(r) order by id) from public.reminder_candidates r),'notices',(select jsonb_agg(to_jsonb(n) order by id) from public.inbox_notifications n),'activity',(select jsonb_agg(to_jsonb(a) order by id) from public.activity_events a),'routines',(select jsonb_agg(to_jsonb(r) order by id) from public.routines r),'week',(select revision from public.nest_meal_week_revisions where household_id='${id(10)}' and week_start='${week}'))`,
    );
  const before = state();
  db.sql(
    `create function private.fail_removal_receipt() returns trigger language plpgsql as $$ begin raise exception 'receipt fault'; end $$; create trigger fail_removal_receipt before insert on public.nest_meal_removal_receipts for each row execute function private.fail_removal_receipt()`,
  );
  try {
    assert.throws(() => remove(id(452), input), /receipt fault/);
    assert.equal(state(), before);
  } finally {
    db.sql(
      "drop trigger fail_removal_receipt on public.nest_meal_removal_receipts; drop function private.fail_removal_receipt()",
    );
  }
});

test("partner receipt is private and revocation blocks immutable replay and direct writes", () => {
  const f = fixture();
  try {
    const input = f.add(460);
    f.remove(id(461), input, { actor: id(2) });
    assert.equal(
      f.db.sql(as("select count(*) from public.nest_meal_removal_receipts", id(1))),
      "0",
    );
    assert.equal(
      f.db.sql(as("select count(*) from public.nest_meal_removal_receipts", id(2))),
      "1",
    );
    assert.throws(
      () =>
        f.db.sql(
          as(`update public.meal_plan_entries set removed_at=null where id='${input.entryId}'`),
        ),
      /permission denied/,
    );
    assert.throws(
      () =>
        f.db.sql(`set role anon; select public.nest_remove_meal('${id(10)}','${id(461)}','{}')`),
      /permission denied/,
    );
    f.db.sql(
      `delete from public.household_members where household_id='${id(10)}' and user_id='${id(2)}'`,
    );
    assert.throws(() => f.remove(id(461), input, { actor: id(2) }), /Not authorized/);
    assert.equal(
      f.db.sql(as("select count(*) from public.nest_meal_removal_receipts", id(2))),
      "0",
    );
  } finally {
    f.db.stop();
  }
});
test("competing partner removals accept one baseline without duplicate closure", async () => {
  const input = add(470),
    occurrence = preparation(input.entryId, id(471));
  const results = await Promise.allSettled([
    db.concurrent(command(id(472), input)),
    db.concurrent(command(id(473), input, { actor: id(2) })),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(results.find((r) => r.status === "rejected").reason.message, /Meal week changed/);
  assert.equal(
    db.sql(
      `select count(*) from public.routine_command_receipts where occurrence_id='${occurrence}'`,
    ),
    "1",
  );
});
