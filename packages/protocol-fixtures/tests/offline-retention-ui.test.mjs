import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { groceryFlow } from "../src/groceries/flow.ts";
import { groceryRuntime } from "../src/groceries/runtime.ts";
import { GroceryFailure } from "../src/groceries/client.ts";
import { choreFlow } from "../src/chores/flow.ts";
import { choreRuntime } from "../src/chores/runtime.ts";
import { ChoreFailure } from "../src/chores/client.ts";
import { unresolvedLimit } from "../src/offline/retention.ts";
import { fixture, run, target, operation } from "./offline-fixture.mjs";
import { seedJournal, rows } from "./offline-retention-fixture.mjs";

test("both native offline controllers explain capacity without showing a successful check or completion", async (t) => {
  const f = await fixture(t);
  const item = {
    itemId: target,
    name: "Milk",
    quantity: null,
    unit: null,
    categoryId: null,
    version: "1",
    checked: false,
    legacyClaimed: false,
  };
  const chore = { occurrenceId: target, title: "Kitchen", dueDate: "2026-09-20", assigneeId: null };
  await run(f.store.saveGroceries(f.session, [item]));
  await run(f.store.saveChores(f.session, [chore]));
  seedJournal(f.connection, unresolvedLimit, { status: "pending" });
  const before = rows(f.connection),
    groceryViews = [],
    choreViews = [];
  const groceries = groceryRuntime(
    groceryFlow(f, {
      list: () => Effect.fail(new GroceryFailure({ code: "unavailable" })),
      check: () => Effect.fail(new GroceryFailure({ code: "unavailable" })),
    }),
    (view) => groceryViews.push(view),
  );
  const chores = choreRuntime(
    choreFlow(f.store, f.session, {
      snapshot: () => Effect.fail(new ChoreFailure({ code: "unavailable" })),
      complete: () => assert.fail("unsubmitted completion dispatched"),
    }),
    (view) => choreViews.push(view),
  );
  t.after(() => {
    groceries.dispose();
    chores.dispose();
  });
  await groceries.refresh();
  await chores.refresh();
  await groceries.check(item, true, operation);
  assert.match(groceryViews.at(-1).error, /full.*Connect and sync/);
  assert.equal(groceryViews.at(-1).data.groceries[0].checked, false);
  await chores.complete(chore, operation, chore.dueDate);
  assert.match(choreViews.at(-1).error, /full.*Connect and sync/);
  assert.equal(choreViews.at(-1).data.chores[0].done, false);
  assert.deepEqual(rows(f.connection), before);
});
