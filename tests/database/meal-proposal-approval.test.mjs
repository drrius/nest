import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, target, id, as, week, content } from "./meal-proposal-approval-fixture.mjs";

test("exact generated preview becomes a shared retained week once, without library or grocery writes", async (t) => {
  const f = fixture(t),
    body = content(),
    p = f.ready(id(800), body);
  const replies = await Promise.all(
    Array.from({ length: 4 }, () => f.db.concurrent(f.approveCommand(id(801), target(p)))),
  );
  const receipt = f.approve(id(801), target(p));
  for (const reply of replies) assert.deepEqual(JSON.parse(reply.stdout), receipt);
  assert.equal(receipt.weekRevision, "7");
  assert.equal(f.read(p).proposal.status, "approved");
  assert.equal(f.read(p).proposal.revision, "3");
  for (const [index, posted] of receipt.entries.entries()) {
    assert.equal(posted.proposalEntryId, body.entries[index].entryId);
    const stored = f.recipe(posted.entryId, "7", id(2)).snapshot;
    assert.equal(stored.libraryRevision, null);
    assert.equal(stored.recipe.definitionId, null);
    const { definitionId: _definition, ingredients, ...recipe } = stored.recipe;
    const { ingredients: expected, ...draft } = body.entries[index].source.recipe;
    assert.deepEqual(recipe, draft);
    assert.deepEqual(
      ingredients.map(({ ingredientId: _id, order: _order, ...item }) => item),
      expected,
    );
  }
  assert.equal(
    f.db.sql(
      "select count(distinct recipe#>>'{ingredients,0,ingredientId}') from public.nest_planned_recipe_snapshots",
    ),
    "7",
  );
  for (const table of ["grocery_items", "routines"])
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
  assert.equal(f.db.sql("select count(*) from public.meal_definitions"), "3");
  assert.throws(() => f.approve(id(802), target(p)), /Proposal changed/);
  assert.throws(
    () => f.approve(id(801), target(p, { expectedRevision: "3" })),
    /operation changed/,
  );
  f.remove(id(803), f.baseline(receipt.entries[0].entryId));
  assert.deepEqual(f.approve(id(801), target(p)), receipt);
});

test("saved preview retains reviewed content and provenance across library edits/archive", (t) => {
  const f = fixture(t);
  f.db.sql(
    `update public.meal_definitions set nest_servings=2,nest_instructions='Simmer.' where id='${id(200)}'`,
  );
  const revision = f.db.sql(
    `select revision from public.nest_meal_library_revisions where household_id='${id(10)}'`,
  );
  const original = JSON.parse(
    f.db.sql(as(`select public.nest_saved_meal('${id(10)}','${id(200)}','${revision}')`)),
  ).recipe;
  const body = content();
  body.familiarOnly = true;
  body.entries.forEach((e) => {
    e.source = { kind: "saved", libraryRevision: revision, recipe: original };
  });
  const p = f.ready(id(800), body);
  f.db
    .sql(`update public.meal_definitions set name='Changed',archived_at=now() where id='${id(200)}';
    update public.meal_grocery_templates set quantity='999' where id='${id(300)}'`);
  const receipt = f.approve(id(801), target(p));
  for (const e of receipt.entries) {
    const stored = f.recipe(e.entryId, receipt.weekRevision).snapshot;
    assert.equal(stored.libraryRevision, revision);
    assert.deepEqual(stored.recipe, original);
  }
});

test("approval requires current owner membership and exact native input; helpers and private rows stay inaccessible", (t) => {
  const f = fixture(t),
    p = f.ready();
  for (const scope of [{ actor: id(2) }, { actor: id(3) }, { home: id(20) }])
    assert.throws(() => f.approve(id(801), target(p), scope), /changed|authorized/);
  for (const patch of [
    { expectedRevision: "1" },
    { expectedRevision: 2 },
    { expectedRevision: "02" },
    { approved: true },
    { entries: [] },
  ])
    assert.throws(() => f.approve(id(801), target(p, patch)), /changed|Invalid/);
  for (const role of ["anon", "service_role"])
    assert.throws(
      () =>
        f.db.sql(
          f
            .approveCommand(id(801), target(p))
            .replace("set role authenticated", `set role ${role}`),
        ),
      /permission denied/,
    );
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.throws(
      () => f.db.sql(`set role ${role}; select private.nest_approved_recipe('${id(10)}','{}')`),
      /permission denied/,
    );
    assert.throws(
      () => f.db.sql(`set role ${role}; select * from private.nest_meal_proposal_receipts`),
      /permission denied/,
    );
  }
  f.approve(id(801), target(p));
  f.db.sql(`delete from public.household_members where user_id='${id(1)}'`);
  assert.throws(() => f.approve(id(801), target(p)), /authorized/);
});

test("new week contents and changed partner constraints invalidate approval without partial posting", (t) => {
  const changes = [
    `update public.nest_food_profiles set restrictions=array['Changed'] where actor_id='${id(2)}'`,
    `update public.nest_food_profiles set calorie_goal=2500 where actor_id='${id(2)}'`,
    `update public.nest_cooking_preferences set meal_slots=array['lunch']`,
    `update public.household_members set joined_at=joined_at+interval '1 second' where user_id='${id(2)}'`,
    `insert into public.meal_plan_entries(id,household_id,date,slot,title_snapshot) values('${id(700)}','${id(10)}','${week}','lunch','Partner added')`,
  ];
  for (const change of changes) {
    const f = fixture(t),
      p = f.ready();
    f.db.sql(change);
    assert.throws(() => f.approve(id(801), target(p)), /changed/);
    assert.equal(f.read(p).proposal.status, "ready");
    assert.equal(f.db.sql("select count(*) from public.nest_planned_recipe_snapshots"), "0");
  }
});

test("generating, failed, discarded, expired and stale proposals cannot approve", (t) => {
  const f = fixture(t);
  const generating = f.begin(id(800)).proposalId;
  assert.throws(() => f.approve(id(801), target(generating, { expectedRevision: "1" })), /changed/);
  f.db.sql(
    `update private.nest_meal_proposals set expires_at=clock_timestamp()-interval '1 second' where proposal_id='${generating}'`,
  );
  f.recover(generating);
  assert.throws(() => f.approve(id(801), target(generating)), /changed/);
  const discarded = f.ready(id(802));
  f.discard(id(803), discarded, "2");
  assert.throws(() => f.approve(id(801), target(discarded, { expectedRevision: "3" })), /changed/);
  const expired = f.ready(id(804));
  f.db.sql(
    `update private.nest_meal_proposals set expires_at=clock_timestamp()-interval '1 second' where proposal_id='${expired}'`,
  );
  assert.throws(() => f.approve(id(801), target(expired)), /expired/);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "0");
});

test("receipt failure rolls back meals, snapshots, week revision and approval state", (t) => {
  const f = fixture(t),
    p = f.ready();
  f.db
    .sql(`create function private.reject_approval_receipt() returns trigger language plpgsql as $$begin raise exception 'fixture receipt failure'; end$$;
    create trigger reject_approval_receipt before insert on private.nest_meal_proposal_receipts for each row execute function private.reject_approval_receipt()`);
  assert.throws(() => f.approve(id(801), target(p)), /fixture receipt failure/);
  for (const table of ["meal_plan_entries", "nest_planned_recipe_snapshots"])
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
  assert.equal(f.baseline(id(700)).expectedRevision, "0");
  assert.equal(f.read(p).proposal.status, "ready");
  f.db.sql("drop trigger reject_approval_receipt on private.nest_meal_proposal_receipts");
  assert.equal(f.approve(id(801), target(p)).weekRevision, "7");
});

test("two owners cannot approve competing weeks; approval/discard races have one winner", async (t) => {
  const f = fixture(t),
    first = f.ready(),
    second = f.ready(id(802), content(), id(2));
  const results = await Promise.allSettled([
    f.db.concurrent(f.approveCommand(id(801), target(first))),
    f.db.concurrent(f.approveCommand(id(803), target(second), { actor: id(2) })),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.db.sql("select count(*) from public.meal_plan_entries"), "7");
  const g = fixture(t),
    proposal = g.ready();
  const race = await Promise.allSettled([
    g.db.concurrent(g.approveCommand(id(801), target(proposal))),
    g.db.concurrent(g.discardCommand(id(802), proposal, "2")),
  ]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
  const approved = g.read(proposal).proposal.status === "approved";
  assert.equal(g.db.sql("select count(*) from public.meal_plan_entries"), approved ? "7" : "0");
});
