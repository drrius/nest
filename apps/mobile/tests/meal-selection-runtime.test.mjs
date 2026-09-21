import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { RecipeSelectionRuntime } from "../src/meals/selection-runtime.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const target = { weekStart: "2030-01-07", date: "2030-01-07", slot: "dinner" };
function fixture(t, replace = false) {
  let readFailure = null,
    writeFailure = null,
    writes = [],
    reads = 0;
  const entry = { entryId: id(10), date: target.date, slot: target.slot };
  let week = { revision: "3", entries: replace ? [entry] : [] };
  let library = {
    revision: "8",
    meals: [{ definitionId: id(20), title: "Soup" }],
    nextAfterId: id(20),
  };
  const client = {
    read: () => {
      reads++;
      return readFailure
        ? Effect.fail(new PreferenceFailure({ code: readFailure }))
        : Effect.succeed(week);
    },
    library: {
      read: (after, revision) => {
        if (after) {
          assert.equal(revision, "8");
          return Effect.succeed({
            ...library,
            meals: [{ definitionId: id(21), title: "Rice" }],
            nextAfterId: null,
          });
        }
        return Effect.succeed(library);
      },
      recipe: (definitionId, revision) =>
        Effect.succeed({ revision, recipe: { definitionId, title: "Soup", ingredients: [] } }),
    },
    placeRecipe: (input) => send(input),
    replaceWithRecipe: (input) => send(input),
  };
  function send(input) {
    writes.push(structuredClone(input));
    if (writeFailure) return Effect.fail(new PreferenceFailure({ code: writeFailure }));
    week = { ...week, revision: replace ? "5" : "4" };
    return Effect.succeed({ revision: week.revision, entryId: id(30) });
  }
  const runtime = new RecipeSelectionRuntime(
    client,
    replace ? { ...target, entryId: id(10) } : target,
    () => id(40),
  );
  t.after(() => runtime.dispose());
  return {
    runtime,
    writes,
    setWrite: (code) => {
      writeFailure = code;
    },
    setRead: (code) => {
      readFailure = code;
    },
    setWeek: (value) => {
      week = value;
    },
    getReads: () => reads,
    setLibrary: (value) => {
      library = value;
    },
  };
}
test("selection pages at one library revision, previews exact detail and retains an uncertain placement unchanged", async (t) => {
  const f = fixture(t),
    r = f.runtime;
  await r.load();
  await r.more();
  assert.equal(r.getSnapshot().library.meals.length, 2);
  await r.select(id(21));
  f.setWrite("unavailable");
  await r.save();
  assert.equal(r.getSnapshot().stage, "uncertain");
  const reads = f.getReads();
  await r.load();
  await r.select(id(20));
  r.clear();
  await r.save();
  assert.equal(f.getReads(), reads);
  assert.equal(f.writes.length, 1);
  assert.equal(r.getSnapshot().selected.recipe.definitionId, id(21));
  f.setWrite(null);
  await r.retry();
  assert.deepEqual(f.writes[0], f.writes[1]);
  assert.deepEqual(f.writes[0], {
    ...target,
    operationId: id(40),
    definitionId: id(21),
    expectedRevision: "3",
    expectedLibraryRevision: "8",
  });
  assert.equal(r.getSnapshot().stage, "saved");
  await r.save();
  assert.equal(f.writes.length, 2);
});
test("replacement binds the source and conflicts keep a read-only preview until explicit successful reload", async (t) => {
  const f = fixture(t, true),
    r = f.runtime;
  await r.load();
  await r.select(id(20));
  f.setWrite("conflict");
  await r.save();
  assert.equal(f.writes[0].entryId, id(10));
  assert.equal(r.getSnapshot().stage, "reload");
  await r.select(id(20));
  await r.save();
  assert.equal(f.writes.length, 1);
  f.setRead("unavailable");
  await r.load();
  assert.equal(r.getSnapshot().selected.recipe.definitionId, id(20));
  f.setRead(null);
  await r.load();
  assert.equal(r.getSnapshot().selected, null);
  await r.save();
  assert.equal(f.writes.length, 1);
});
test("acknowledged selection never resends after failed refresh or authorization loss", async (t) => {
  const f = fixture(t),
    r = f.runtime;
  await r.load();
  await r.select(id(20));
  f.setRead("forbidden");
  await r.save();
  assert.equal(r.getSnapshot().stage, "verify");
  assert.equal(r.getSnapshot().selected, null);
  assert.equal(r.getSnapshot().receipt, null);
  f.setRead("unavailable");
  await r.load();
  assert.equal(r.getSnapshot().stage, "verify");
  f.setRead(null);
  await r.load();
  assert.equal(r.getSnapshot().stage, "saved");
  await r.select(id(20));
  await r.save();
  await r.retry();
  assert.equal(f.writes.length, 1);
});
test("changed destination blocks placement and replacement before dispatch", async (t) => {
  for (const replace of [false, true]) {
    const f = fixture(t, replace),
      r = f.runtime;
    f.setWeek({
      revision: "3",
      entries: [{ entryId: id(99), date: target.date, slot: target.slot }],
    });
    await r.load();
    await r.select(id(20));
    await r.save();
    assert.equal(r.getSnapshot().stage, "reload");
    assert.equal(f.writes.length, 0);
  }
});
