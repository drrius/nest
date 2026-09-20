import { fixtureChoreSnapshot } from "./chore-snapshot-fixture.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { reconnectSync } from "../src/offline/reconnect.ts";
import { groceryController } from "../src/groceries/controller.ts";
import { choreController } from "../src/chores/controller.ts";
import { GroceryFailure } from "../src/groceries/client.ts";
import { ChoreFailure } from "../src/chores/client.ts";
import { emptyTransfers, fixture, operation, target, run } from "./offline-fixture.mjs";
const connected = { isConnected: true, isInternetReachable: true };
const offline = { isConnected: false, isInternetReachable: false };
function events(refresh, network = () => Promise.resolve(offline)) {
  let activity, connectivity;
  const stop = reconnectSync({
    active: true,
    refresh,
    network,
    onActivity: (listener) => {
      activity = listener;
      return { remove() {} };
    },
    onNetwork: (listener) => {
      connectivity = listener;
      return { remove() {} };
    },
  });
  return { activity: (next) => activity(next), network: (next) => connectivity(next), stop };
}

test("reconnect and foreground trigger sync, repeated online events and background changes do not", async () => {
  let calls = 0;
  const source = events(async () => {
    calls++;
  });
  await Promise.resolve();
  assert.equal(calls, 1);
  source.network(connected);
  source.network(connected);
  assert.equal(calls, 2);
  source.activity(false);
  source.network(offline);
  source.network(connected);
  assert.equal(calls, 2);
  source.activity(true);
  source.activity(true);
  assert.equal(calls, 3);
  source.stop();
  source.network(offline);
  source.network(connected);
  source.activity(false);
  source.activity(true);
  assert.equal(calls, 3, "queued callbacks cannot sync after account cleanup");
});

test("a delayed initial connectivity read cannot overwrite a newer event", async () => {
  let resolve,
    calls = 0;
  const source = events(
    async () => {
      calls++;
    },
    () =>
      new Promise((finish) => {
        resolve = finish;
      }),
  );
  source.network(connected);
  assert.equal(calls, 2);
  resolve(offline);
  await Promise.resolve();
  source.network(connected);
  assert.equal(calls, 2);
  source.stop();
});

test("unavailable native monitoring leaves foreground refresh usable without unhandled rejection", async () => {
  let calls = 0,
    activity;
  const stop = reconnectSync({
    active: true,
    refresh: async () => {
      calls++;
      throw new Error("fixture offline");
    },
    network: async () => {
      throw new Error("fixture unavailable");
    },
    onNetwork: () => {
      throw new Error("fixture missing native listener");
    },
    onActivity: (listener) => {
      activity = listener;
      return { remove() {} };
    },
  });
  await Promise.resolve();
  activity(false);
  activity(true);
  assert.equal(calls, 2);
  stop();
});

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
const nextOperation = "50000000-0000-4000-8000-000000000002";
async function queuedFixture(t) {
  const db = await fixture(t);
  await run(db.store.saveGroceries(db.session, [item]));
  await run(
    db.store.saveChores(db.session, [
      { occurrenceId: target, title: "Plants", dueDate: "2026-09-20", assigneeId: null },
    ]),
  );
  await run(
    db.store.enqueue(db.session, {
      kind: "groceries.setChecked",
      operation,
      target,
      expected: "1",
      checked: true,
    }),
  );
  await run(
    db.store.enqueue(db.session, {
      kind: "chore.complete",
      operation: nextOperation,
      target,
      expected: "2026-09-20",
      completedOn: "2026-09-20",
    }),
  );
  const edit = {
    action: "add",
    command: {
      operationId: "50000000-0000-4000-8000-000000000003",
      itemId: nextOperation,
      name: "Retained online attempt",
      quantity: null,
      unit: null,
      categoryId: null,
    },
  };
  await run(db.store.stageGroceryChange(db.session, edit));
  return { db, edit, account: { store: db.store, session: db.session } };
}

test("account-owned controllers replay both allowed kinds after screens close, never retained online edits", async (t) => {
  const { db, edit, account } = await queuedFixture(t);
  let live = false,
    synced = Promise.resolve();
  const calls = [];
  const groceryClient = fixtureGroceries(() => live, calls);
  const chores = choreController(
    account,
    {
      snapshot: fixtureChoreSnapshot,
      listTransfers: () => Effect.succeed(emptyTransfers),
      list: () =>
        live ? Effect.succeed([]) : Effect.fail(new ChoreFailure({ code: "unavailable" })),
      complete: (command) => {
        calls.push(["complete", command.operationId]);
        return live
          ? Effect.succeed({ outcome: "completed", completedBy: account.session.actor })
          : Effect.fail(new ChoreFailure({ code: "unavailable" }));
      },
    },
    () => {},
    () => {},
  );
  const groceries = groceryController(
    account,
    groceryClient,
    () => {},
    () => {},
  );
  const screen = groceryController(
    account,
    groceryClient,
    () => {},
    () => {},
  );
  assert.equal(screen.controller, groceries.controller);
  screen.release();
  const source = events(async () => {
    synced = Promise.all([chores.controller.refresh(), groceries.controller.refresh()]);
    await synced;
  });
  t.after(() => {
    source.stop();
    chores.release();
    groceries.release();
  });
  await synced;
  assert.equal((await run(db.store.read(db.session))).pending.length, 2);
  live = true;
  source.network(connected);
  await synced;
  assert.equal((await run(db.store.read(db.session))).pending.length, 0);
  assert.deepEqual(await run(db.store.readGroceryChange(db.session)), edit);
  assert.deepEqual(
    calls.filter(([kind]) => kind === "check").map(([, id]) => id),
    [operation, operation],
  );
  assert.deepEqual(
    calls.filter(([kind]) => kind === "complete").map(([, id]) => id),
    [nextOperation, nextOperation],
  );
  let view;
  const reopened = groceryController(
    account,
    groceryClient,
    (next) => {
      view = next;
    },
    () => {},
  );
  assert.equal(view.data.groceries[0].checked, true);
  reopened.release();
});

function fixtureGroceries(live, calls) {
  return {
    list: () =>
      live()
        ? Effect.succeed([{ ...item, version: "2", checked: true }])
        : Effect.fail(new GroceryFailure({ code: "unavailable" })),
    check: (command) => {
      calls.push(["check", command.operationId]);
      return live()
        ? Effect.succeed({ operation, target, version: "2", checked: true, outcome: "applied" })
        : Effect.fail(new GroceryFailure({ code: "unavailable" }));
    },
    change: () => {
      assert.fail("online edit must never replay automatically");
    },
  };
}

test("reconnect before an old request fails drains both SQLite queues", async (t) => {
  const { db, account } = await queuedFixture(t);
  let release,
    started = 0,
    bothStarted;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    bothStarted = resolve;
  });
  /** @param {GroceryFailure | ChoreFailure} failure */
  const delayedFailure = (failure) =>
    Effect.flatMap(
      Effect.promise(async () => {
        if (++started === 2) bothStarted();
        await gate;
      }),
      () => Effect.fail(failure),
    );
  let checks = 0,
    completions = 0,
    synced = Promise.resolve();
  const groceries = groceryController(
    account,
    {
      ...fixtureGroceries(() => true, []),
      check: () =>
        ++checks === 1
          ? delayedFailure(new GroceryFailure({ code: "unavailable" }))
          : Effect.succeed({
              operation,
              target,
              version: "2",
              checked: true,
              outcome: "applied",
            }),
    },
    () => {},
    () => {},
  );
  const chores = choreController(
    account,
    {
      snapshot: fixtureChoreSnapshot,
      listTransfers: () => Effect.succeed(emptyTransfers),
      list: () => Effect.succeed([]),
      complete: () =>
        ++completions === 1
          ? delayedFailure(new ChoreFailure({ code: "unavailable" }))
          : Effect.succeed({
              outcome: "completed",
              completedBy: account.session.actor,
            }),
    },
    () => {},
    () => {},
  );
  const source = events(async () => {
    synced = Promise.all([chores.controller.refresh(), groceries.controller.refresh()]);
    await synced;
  });
  t.after(() => {
    source.stop();
    chores.release();
    groceries.release();
  });
  await ready;
  source.network(connected);
  release();
  await synced;
  assert.equal(checks, 2);
  assert.equal(completions, 2);
  assert.equal((await run(db.store.read(db.session))).pending.length, 0);
});
