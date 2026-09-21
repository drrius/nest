import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, account, lease, run } from "./offline-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const write = (n = 200, revision = "1", weekStart = "2030-01-07") => ({
  target: { entryId: id(n), weekStart, revision },
  snapshot: {
    version: 1,
    householdId: account.household,
    weekStart,
    revision,
    entry: {
      entryId: id(n),
      definitionId: id(300),
      leftoverSourceId: null,
      date: weekStart,
      slot: "dinner",
      title: "Soup",
      recipeUrl: null,
      notes: null,
    },
    snapshot: {
      libraryRevision: "0",
      recipe: {
        definitionId: id(300),
        title: "Soup",
        recipeUrl: null,
        notes: null,
        servings: null,
        instructions: null,
        ingredients: [],
      },
    },
  },
});
test("planned cache survives restart and a newer removal cannot be replaced by an old reply", async (t) => {
  const f = await fixture(t),
    value = write(200, "9007199254740993");
  await run(f.store.savePlannedRecipe(f.session, value));
  const reopened = f.reopen();
  assert.deepEqual(
    await run(reopened.store.readPlannedRecipe(f.session, value.target)),
    value.snapshot,
  );
  const removed = {
    target: { ...value.target, revision: "9007199254740994" },
    snapshot: { ...value.snapshot, revision: "9007199254740994", entry: null, snapshot: null },
  };
  await run(reopened.store.savePlannedRecipe(f.session, removed));
  assert.deepEqual(await run(reopened.store.savePlannedRecipe(f.session, value)), removed.snapshot);
  assert.deepEqual(
    await run(reopened.store.readPlannedRecipe(f.session, value.target)),
    removed.snapshot,
  );
  const moved = write(200, "1", "2030-01-14");
  await run(reopened.store.savePlannedRecipe(f.session, moved));
  assert.deepEqual(
    await run(reopened.store.readPlannedRecipe(f.session, moved.target)),
    moved.snapshot,
  );
});
test("planned cache isolates accounts and leases and retains the 32 most recently saved details", async (t) => {
  const f = await fixture(t),
    other = { ...account, actor: id(900) };
  const foreign = await run(f.store.activate(other, lease));
  await run(f.store.savePlannedRecipe(foreign, write()));
  const own = await run(f.store.activate(account, id(901)));
  assert.equal(await run(f.store.readPlannedRecipe(own, write().target)), null);
  for (let i = 200; i < 234; i++) await run(f.store.savePlannedRecipe(own, write(i)));
  assert.equal(await run(f.store.readPlannedRecipe(own, write().target)), null);
  assert.deepEqual(
    await run(f.store.readPlannedRecipe(own, write(233).target)),
    write(233).snapshot,
  );
  assert.equal(
    f.connection
      .prepare("select count(*) n from offline_planned_recipes where actor=?")
      .get(account.actor).n,
    32,
  );
  await assert.rejects(run(f.store.savePlannedRecipe(foreign, write())), {
    reason: "session_changed",
  });
  const selected = await run(f.store.activate(other, lease));
  assert.deepEqual(
    await run(f.store.readPlannedRecipe(selected, write().target)),
    write().snapshot,
  );
});
test("planned cache rejects bad bindings and repairs corrupt rows only through a valid save", async (t) => {
  const f = await fixture(t),
    value = write();
  for (const patch of [
    { householdId: id(90) },
    { weekStart: "2030-01-14" },
    { revision: "2" },
    { entry: { ...value.snapshot.entry, entryId: id(9) } },
    {
      snapshot: {
        ...value.snapshot.snapshot,
        recipe: { ...value.snapshot.snapshot.recipe, title: "Wrong" },
      },
    },
  ])
    await assert.rejects(
      run(
        f.store.savePlannedRecipe(f.session, {
          ...value,
          snapshot: { ...value.snapshot, ...patch },
        }),
      ),
      { reason: "invalid_input" },
    );
  await run(f.store.savePlannedRecipe(f.session, value));
  f.connection.prepare("update offline_planned_recipes set data='{' ").run();
  await assert.rejects(run(f.store.readPlannedRecipe(f.session, value.target)), {
    reason: "storage",
  });
  await run(f.store.savePlannedRecipe(f.session, value));
  f.connection
    .prepare("update offline_planned_recipes set data=?")
    .run(JSON.stringify({ ...value.snapshot, householdId: id(9) }));
  await assert.rejects(run(f.store.readPlannedRecipe(f.session, value.target)), {
    reason: "invalid_input",
  });
  await run(f.store.savePlannedRecipe(f.session, value));
  assert.deepEqual(await run(f.store.readPlannedRecipe(f.session, value.target)), value.snapshot);
});
test("cancelled cache writes and retention failure roll back completely", async (t) => {
  const f = await fixture(t),
    value = write();
  await assert.rejects(run(f.store.savePlannedRecipe(f.session, value, () => false)), {
    reason: "cancelled",
  });
  let calls = 0;
  await assert.rejects(run(f.store.savePlannedRecipe(f.session, value, () => ++calls < 3)), {
    reason: "cancelled",
  });
  assert.equal(await run(f.store.readPlannedRecipe(f.session, value.target)), null);
  for (let i = 200; i < 232; i++) await run(f.store.savePlannedRecipe(f.session, write(i)));
  f.connection.exec(
    "create trigger fail_planned_cleanup before delete on offline_planned_recipes begin select raise(abort,'fixture failure'); end",
  );
  await assert.rejects(run(f.store.savePlannedRecipe(f.session, write(232))), {
    reason: "storage",
  });
  assert.equal(await run(f.store.readPlannedRecipe(f.session, write(232).target)), null);
  assert.deepEqual(await run(f.store.readPlannedRecipe(f.session, value.target)), value.snapshot);
});

test("cache captures caller-owned identities and data before asynchronous writes", async (t) => {
  const f = await fixture(t),
    value = write(),
    target = { ...value.target },
    expected = structuredClone(value.snapshot);
  await run(
    f.store.savePlannedRecipe(f.session, value, () => {
      value.target.entryId = id(999);
      value.snapshot.householdId = id(999);
      return true;
    }),
  );
  assert.deepEqual(await run(f.store.readPlannedRecipe(f.session, target)), expected);
  assert.equal(await run(f.store.readPlannedRecipe(f.session, value.target)), null);
});
