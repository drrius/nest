import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { PlannedRecipeRuntime } from "../src/meals/planned-recipe-runtime.ts";
import { plannedRecipeOwner } from "../src/meals/planned-recipe-owner.ts";
import { PreferenceFailure } from "../src/preferences/client.ts";
import { fixture, account, run } from "./offline-fixture.mjs";
const target = {
  entryId: "00000000-0000-4000-8000-000000000200",
  weekStart: "2030-01-07",
  revision: "1",
};
const snapshot = (revision = "1") => ({
  version: 1,
  householdId: account.household,
  weekStart: target.weekStart,
  revision,
  entry: {
    entryId: target.entryId,
    definitionId: null,
    leftoverSourceId: null,
    date: target.weekStart,
    slot: "dinner",
    title: "Soup",
    recipeUrl: null,
    notes: null,
  },
  snapshot: null,
});
const removed = (revision = "2") => ({ ...snapshot(revision), entry: null });
const fail = (code) => Effect.fail(new PreferenceFailure({ code }));
const setup = async (t) => {
  const f = await fixture(t);
  let revision = "2",
    response = removed(),
    failure = null;
  const requested = [];
  const client = {
    read: () => (failure ? fail(failure) : Effect.succeed({ revision })),
    plannedRecipe: (query) => {
      requested.push(query);
      return Effect.succeed(response);
    },
  };
  const runtime = new PlannedRecipeRuntime(client, f, target);
  t.after(() => runtime.dispose());
  return {
    ...f,
    runtime,
    client,
    requested,
    set: (value, code = null) => {
      response = value;
      revision = value.revision;
      failure = code;
    },
  };
};
test("planned detail refresh binds the latest week and replaces cached content with an explicit removal", async (t) => {
  const f = await setup(t);
  await run(f.store.savePlannedRecipe(f.session, { target, snapshot: snapshot() }));
  const views = [];
  f.runtime.subscribe(() => views.push(f.runtime.getSnapshot()));
  await f.runtime.load();
  assert.ok(views.some((view) => view.snapshot?.entry?.title === "Soup" && !view.fresh));
  assert.deepEqual(f.requested, [{ ...target, revision: "2" }]);
  assert.deepEqual(f.runtime.getSnapshot().snapshot, removed());
  assert.equal(f.runtime.getSnapshot().fresh, true);
  f.set(removed(), "unavailable");
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().snapshot.entry, null);
  assert.equal(f.runtime.getSnapshot().fresh, false);
  assert.match(f.runtime.getSnapshot().notice, /saved details/);
});
test("authorization denial hides cache across later network failures; successful authorization restores access", async (t) => {
  const f = await setup(t);
  await run(f.store.savePlannedRecipe(f.session, { target, snapshot: snapshot() }));
  f.set(removed(), "forbidden");
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().access, "verify");
  assert.equal(f.runtime.getSnapshot().snapshot, null);
  const views = [];
  f.runtime.subscribe(() => views.push(f.runtime.getSnapshot()));
  f.set(removed(), "unavailable");
  await f.runtime.load();
  assert.ok(views.every((view) => view.snapshot === null));
  assert.match(f.runtime.getSnapshot().notice, /Verify/);
  f.set(removed());
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().access, "ready");
  assert.equal(f.runtime.getSnapshot().fresh, true);
});
test("a newer cache wins a delayed read without falsely claiming freshness", async (t) => {
  const f = await setup(t);
  await run(
    f.store.savePlannedRecipe(f.session, {
      target: { ...target, revision: "3" },
      snapshot: removed("3"),
    }),
  );
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().snapshot.revision, "3");
  assert.equal(f.runtime.getSnapshot().fresh, false);
  assert.match(f.runtime.getSnapshot().notice, /newer saved/);
});
test("lease loss clears cached data even when the network later fails", async (t) => {
  const f = await setup(t);
  f.set(snapshot("2"));
  await f.runtime.load();
  await run(
    f.store.activate(
      { ...account, actor: "00000000-0000-4000-8000-000000000999" },
      "00000000-0000-4000-8000-000000000998",
    ),
  );
  f.set(removed(), "unavailable");
  await f.runtime.load();
  assert.equal(f.runtime.getSnapshot().access, "verify");
  assert.equal(f.runtime.getSnapshot().snapshot, null);
});
test("cancelled reads cannot publish or save late content and owners recreate disposed runtimes", async (t) => {
  const f = await fixture(t);
  let release, started;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  const client = {
    read: () => Effect.succeed({ revision: "2" }),
    plannedRecipe: () =>
      Effect.promise(() => {
        started();
        return new Promise((resolve) => {
          release = resolve;
        });
      }),
  };
  const mutable = { ...target };
  const owner = plannedRecipeOwner(client, f, mutable);
  mutable.entryId = "bad";
  const unsubscribe = owner.subscribe(() => {});
  const first = owner.getSnapshot();
  const loading = first.load();
  await began;
  first.cancel();
  release(removed());
  await loading;
  assert.equal(first.getSnapshot().snapshot, null);
  assert.equal(await run(f.store.readPlannedRecipe(f.session, target)), null);
  unsubscribe();
  assert.equal(owner.getSnapshot(), null);
  const stop = owner.subscribe(() => {});
  assert.notEqual(owner.getSnapshot(), first);
  stop();
});
