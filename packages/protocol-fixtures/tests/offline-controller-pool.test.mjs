import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { controllerPool } from "../src/offline/controller-pool.ts";
import { groceryRuntime } from "../src/groceries/runtime.ts";
import { groceryFlow } from "../src/groceries/flow.ts";
import { fixture, run, target } from "./offline-fixture.mjs";

const item = {
  itemId: target,
  name: "Milk",
  quantity: "2",
  unit: "litres",
  categoryId: null,
  version: "1",
  checked: false,
  legacyClaimed: false,
};

test("two mounted consumers serialize delayed snapshots and retain the controller until both leave", async (t) => {
  const db = await fixture(t);
  const account = { store: db.store, session: db.session };
  const subscribe = controllerPool();
  const requests = [];
  let firstView,
    secondView,
    created = 0;
  const create = (publish) => {
    created++;
    return groceryRuntime(
      groceryFlow(account, {
        list: () => Effect.promise(() => new Promise((resolve) => requests.push(resolve))),
        check: () => Effect.die("unexpected check"),
      }),
      publish,
    );
  };
  const first = subscribe(account, create, (view) => {
    firstView = view;
  });
  const syncing = first.controller.refresh();
  await until(() => requests.length === 1);
  const second = subscribe(account, create, (view) => {
    secondView = view;
  });
  assert.equal(created, 1);
  assert.equal(first.controller, second.controller);
  const again = second.controller.refresh();
  assert.equal(requests.length, 1, "no concurrent list can overtake the delayed snapshot");
  first.release();
  requests[0]([item]);
  await until(() => requests.length === 2);
  requests[1]([{ ...item, version: "2", checked: true }]);
  await Promise.all([syncing, again]);
  assert.equal(secondView.data.groceries[0].version, "2");
  assert.notEqual(firstView.data?.groceries[0]?.version, "2");
  assert.equal((await run(db.store.readGroceries(db.session))).groceries[0].version, "2");
  second.release();
  await second.controller.refresh();
  assert.equal(requests.length, 2, "last release disposes the controller");
});

test("account controllers and subscriptions stay isolated across release and replacement", () => {
  const subscribe = controllerPool();
  const account = {},
    other = {};
  const publications = [],
    seen = [],
    otherSeen = [];
  let disposed = 0;
  const create = (publish) => {
    publications.push(publish);
    return {
      dispose() {
        disposed++;
      },
    };
  };
  const first = subscribe(account, create, (view) => seen.push(view));
  const second = subscribe(other, create, (view) => otherSeen.push(view));
  publications[0]("private A");
  publications[1]("private B");
  assert.deepEqual(seen, ["private A"]);
  assert.deepEqual(otherSeen, ["private B"]);
  first.release();
  first.release();
  assert.equal(disposed, 1);
  const replacement = subscribe(account, create, (view) => seen.push(view));
  publications[0]("stale");
  assert.deepEqual(seen, ["private A"]);
  publications[2]("fresh");
  assert.deepEqual(seen, ["private A", "fresh"]);
  replacement.release();
  second.release();
  assert.equal(disposed, 3);
});

async function until(condition) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("delayed request did not start");
}
