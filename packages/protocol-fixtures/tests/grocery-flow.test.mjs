import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { groceryFlow } from "../src/groceries/flow.ts";
import { groceryRuntime } from "../src/groceries/runtime.ts";
import { GroceryFailure } from "../src/groceries/client.ts";
import { account, fixture, lease, operation, run, target } from "./offline-fixture.mjs";
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
const second = "50000000-0000-4000-8000-000000000002";
const fail = (code) => Effect.fail(new GroceryFailure({ code }));
const context = (db) => ({ store: db.store, session: db.session });
const receipt = (command, version) => ({
  operation: command.operationId,
  target: command.itemId,
  version,
  checked: command.checked,
  outcome: "applied",
});

test("offline checks survive restart, replay original identities and preserve chore snapshots", async (t) => {
  const db = await fixture(t);
  const captured = { ...item, offlineEpoch: second };
  await run(db.store.saveGroceries(db.session, [captured]));
  await run(
    db.store.saveChores(db.session, [
      { occurrenceId: target, title: "Plants", dueDate: "2026-09-20", assigneeId: null },
    ]),
  );
  const offline = { list: () => fail("unavailable"), check: () => fail("unavailable") };
  const flow = groceryFlow(context(db), offline);
  await run(flow.check(captured, true, operation));
  await assert.rejects(run(flow.sync));
  assert.equal((await run(flow.read)).groceries[0].checked, true);
  const reopened = db.reopen();
  const session = await run(reopened.store.activate(account, lease));
  await run(reopened.store.saveGroceries(session, [{ ...item, offlineEpoch: operation }]));
  const calls = [];
  const live = {
    list: () => Effect.succeed([{ ...item, version: "2", checked: true }]),
    check: (command) => {
      calls.push(command);
      return Effect.succeed(receipt(command, "2"));
    },
  };
  const resumed = groceryFlow({ store: reopened.store, session }, live);
  await run(resumed.sync);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operationId, operation);
  assert.equal(calls[0].expectedVersion, "1");
  assert.equal(calls[0].offlineEpoch, second);
  assert.equal((await run(resumed.read)).pending.length, 0);
  assert.equal((await run(reopened.store.readChores(session))).chores.length, 1);
});

test("check then uncheck use predecessor receipt versions, including acknowledgment racing the second tap", async (t) => {
  const db = await fixture(t);
  await run(db.store.saveGroceries(db.session, [item]));
  await run(
    db.store.enqueue(db.session, {
      kind: "groceries.setChecked",
      operation,
      target,
      expected: "1",
      checked: true,
    }),
  );
  await run(db.store.prepare(db.session));
  await run(db.store.acknowledge(db.session, { operation, version: "2", value: true }));
  await run(
    db.store.enqueue(db.session, {
      kind: "groceries.setChecked",
      operation: second,
      target,
      expected: "1",
      checked: false,
    }),
  );
  assert.equal((await run(db.store.prepare(db.session))).expected, "2");
  await run(db.store.acknowledge(db.session, { operation: second, version: "3", value: false }));
  await run(db.store.saveGroceries(db.session, [{ ...item, version: "9", checked: true }]));
  const third = "50000000-0000-4000-8000-000000000003";
  await run(
    db.store.enqueue(db.session, {
      kind: "groceries.setChecked",
      operation: third,
      target,
      expected: "2",
      checked: false,
    }),
  );
  assert.equal(
    (await run(db.store.prepare(db.session))).expected,
    "2",
    "partner snapshot must not silently rebase an old intent",
  );
});

test("three rapid checks retain original intent ancestry after two acknowledgments", async (t) => {
  const db = await fixture(t);
  await run(db.store.saveGroceries(db.session, [item]));
  const intents = [operation, second, "50000000-0000-4000-8000-000000000003"];
  for (const [index, id] of intents.entries()) {
    await run(
      db.store.enqueue(db.session, {
        kind: "groceries.setChecked",
        operation: id,
        target,
        expected: "1",
        checked: index !== 1,
      }),
    );
    assert.equal((await run(db.store.prepare(db.session))).expected, String(index + 1));
    await run(
      db.store.acknowledge(db.session, {
        operation: id,
        version: String(index + 2),
        value: index !== 1,
      }),
    );
  }
});

for (const code of ["conflict", "cutover"]) {
  test(`conflicts show canonical state and explicit discard removes dependent checks only (${code})`, async (t) => {
    const db = await fixture(t);
    await run(db.store.saveGroceries(db.session, [{ ...item, checked: true }]));
    const flow = groceryFlow(context(db), {
      list: () => Effect.succeed([{ ...item, checked: true, version: "3" }]),
      check: () => fail(code),
    });
    await run(flow.check(item, false, operation));
    await run(flow.check(item, true, second));
    await run(flow.sync);
    const state = await run(flow.read);
    assert.equal(state.groceries[0].conflict, true);
    assert.equal(state.groceries[0].checked, true);
    assert.equal(state.pending.length, 2);
    assert.equal(state.pending[0].status, "conflict");
    assert.equal(state.pending[0].reason, code === "cutover" ? "cutover" : "changed");
    await run(flow.discard(operation));
    assert.equal((await run(flow.read)).pending.length, 0);
    assert.equal((await run(flow.read)).groceries[0].checked, true);
  });
}

test("removed targets become recoverable conflicts without resurrection", async (t) => {
  const db = await fixture(t);
  await run(db.store.saveGroceries(db.session, [item]));
  const flow = groceryFlow(context(db), {
    list: () => Effect.succeed([]),
    check: () => fail("removed"),
  });
  await run(flow.check(item, true, operation));
  await run(flow.sync);
  const data = await run(flow.read);
  assert.equal(data.groceries.length, 0);
  assert.equal(data.pending[0].reason, "removed");
  await run(flow.discard(operation));
  assert.equal((await run(flow.read)).pending.length, 0);
});

test("malformed or duplicate snapshots roll back rather than erasing cached groceries", async (t) => {
  const db = await fixture(t);
  await run(db.store.saveGroceries(db.session, [item]));
  for (const rows of [[{ ...item, version: 1 }], [item, item]])
    await assert.rejects(run(db.store.saveGroceries(db.session, rows)));
  assert.equal((await run(db.store.readGroceries(db.session))).groceries[0].name, "Milk");
});

test("authorization denial remains blocked through outages; successful verified sync restores checking", async (t) => {
  const db = await fixture(t);
  await run(db.store.saveGroceries(db.session, [item]));
  let status = "forbidden",
    view;
  const client = {
    list: () => (status === "ok" ? Effect.succeed([item]) : fail(status)),
    check: () => fail("unavailable"),
  };
  const runtime = groceryRuntime(groceryFlow(context(db), client), (state) => {
    view = state;
  });
  t.after(() => runtime.dispose());
  await runtime.refresh();
  assert.equal(view.access, "verify");
  status = "unavailable";
  await runtime.refresh();
  assert.equal(view.access, "verify");
  await runtime.check(item, true, operation);
  assert.equal((await run(db.store.readGroceries(db.session))).pending.length, 0);
  status = "ok";
  await runtime.refresh();
  assert.equal(view.access, "allowed");
  await runtime.check(item, true, operation);
  await runtime.refresh();
  assert.equal((await run(db.store.readGroceries(db.session))).pending.length, 1);
});

test("rapid opposite taps are durable while duplicate callbacks do not add another intent", async (t) => {
  const db = await fixture(t);
  await run(db.store.saveGroceries(db.session, [item]));
  const flow = groceryFlow(context(db), {
    list: () => fail("unavailable"),
    check: () => fail("unavailable"),
  });
  let view;
  const runtime = groceryRuntime(flow, (state) => {
    view = state;
  });
  t.after(() => runtime.dispose());
  await runtime.refresh();
  const first = runtime.check(item, true, operation);
  const duplicate = runtime.check(item, true, "50000000-0000-4000-8000-000000000099");
  const opposite = runtime.check(item, false, second);
  await Promise.all([first, duplicate, opposite]);
  await runtime.refresh();
  assert.equal(view.data.pending.length, 2);
  assert.equal(view.data.groceries[0].checked, false);
});

test("a compatible partner check cannot rebase a queued opposite intent past partner edits", async (t) => {
  const db = await fixture(t);
  await run(db.store.saveGroceries(db.session, [item]));
  const calls = [];
  const flow = groceryFlow(context(db), {
    list: () => Effect.succeed([{ ...item, name: "Oat milk", version: "3", checked: true }]),
    check: (command) => {
      calls.push(command);
      if (command.checked)
        return Effect.succeed({ ...receipt(command, "3"), outcome: "already_applied" });
      return command.expectedVersion === "3"
        ? Effect.succeed(receipt(command, "4"))
        : fail("conflict");
    },
  });
  await run(flow.check(item, true, operation));
  await run(flow.check(item, false, second));
  await run(flow.sync);
  assert.deepEqual(
    calls.map((command) => command.expectedVersion),
    ["1", "1"],
  );
  const view = await run(flow.read);
  assert.equal(view.pending[0].reason, "changed");
  assert.equal(view.groceries[0].checked, true);
  assert.equal(view.groceries[0].name, "Oat milk");
});

test("a late opposite tap after compatible acknowledgment still uses its observed version after restart", async (t) => {
  const db = await fixture(t);
  await run(db.store.saveGroceries(db.session, [item]));
  await run(
    db.store.enqueue(db.session, {
      kind: "groceries.setChecked",
      operation,
      target,
      expected: "1",
      checked: true,
    }),
  );
  await run(db.store.prepare(db.session));
  await run(
    db.store.acknowledge(db.session, {
      operation,
      version: "3",
      value: true,
      canRebase: false,
    }),
  );
  const reopened = db.reopen();
  await run(
    reopened.store.enqueue(db.session, {
      kind: "groceries.setChecked",
      operation: second,
      target,
      expected: "1",
      checked: false,
    }),
  );
  assert.equal((await run(reopened.store.prepare(db.session))).expected, "1");
});
