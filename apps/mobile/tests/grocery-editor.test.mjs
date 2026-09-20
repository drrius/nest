import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { groceryEditor } from "../src/groceries/editor-runtime.ts";
import { GroceryFailure } from "../src/groceries/client.ts";
import { OfflineFailure } from "../src/offline/contracts.ts";
import { account, fixture, lease, operation, run, target } from "./offline-fixture.mjs";
const change = {
  action: "add",
  command: {
    operationId: operation,
    itemId: target,
    name: "Milk",
    quantity: "2",
    unit: "litres",
    categoryId: null,
  },
};
const receipt = { operation, target, version: "1", checked: false, removed: false };
const unavailable = () => Effect.fail(new GroceryFailure({ code: "unavailable" }));
const context = (db) => ({ store: db.store, session: db.session });
const client = (send) => ({ categories: () => Effect.succeed([]), change: send });

test("an uncertain online save survives restart and retries only on explicit action with identical details", async (t) => {
  const db = await fixture(t);
  const calls = [];
  let view;
  const first = groceryEditor(
    context(db),
    client((input) => {
      calls.push(input);
      return unavailable();
    }),
    (next) => {
      view = next;
    },
  );
  await first.load();
  await first.save(change);
  assert.equal(view.saved, false);
  assert.deepEqual(view.pending, change);
  assert.equal(
    (await run(db.store.read(db.session))).pending.length,
    0,
    "not an offline mutation queue",
  );
  first.dispose();
  const reopened = db.reopen();
  const session = await run(reopened.store.activate(account, lease));
  const second = groceryEditor(
    { store: reopened.store, session },
    client((input) => {
      calls.push(input);
      return Effect.succeed(receipt);
    }),
    (next) => {
      view = next;
    },
  );
  t.after(() => second.dispose());
  await second.load();
  assert.equal(calls.length, 1, "loading and restart never auto-send an online attempt");
  await second.retry();
  assert.deepEqual(calls, [change, change]);
  assert.equal(view.saved, true);
  assert.equal(await run(reopened.store.readGroceryChange(session)), null);
});

test("a retained attempt is immutable, account scoped and cannot be cleared by another operation", async (t) => {
  const db = await fixture(t);
  await run(db.store.stageGroceryChange(db.session, change));
  await assert.rejects(
    run(
      db.store.stageGroceryChange(db.session, {
        ...change,
        command: { ...change.command, name: "Changed" },
      }),
    ),
    { reason: "pending_edit" },
  );
  await assert.rejects(run(db.store.clearGroceryChange(db.session, target)), {
    reason: "operation_reused",
  });
  const other = await run(db.store.activate({ ...account, actor: target }, operation));
  assert.equal(await run(db.store.readGroceryChange(other)), null);
  await assert.rejects(run(db.store.readGroceryChange(db.session)), { reason: "session_changed" });
  const original = await run(db.store.activate(account, lease));
  assert.deepEqual(await run(db.store.readGroceryChange(original)), change);
});

test("duplicate save callbacks send once and storage failure prevents dispatch", async (t) => {
  const db = await fixture(t);
  let calls = 0,
    release;
  const runtime = groceryEditor(
    context(db),
    client(() => {
      calls++;
      return Effect.promise(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
    }),
    () => {},
  );
  t.after(() => runtime.dispose());
  await runtime.load();
  const first = runtime.save(change),
    duplicate = runtime.save(change);
  await until(() => calls === 1);
  release(receipt);
  await Promise.all([first, duplicate]);
  assert.equal(calls, 1);
  const blocked = groceryEditor(
    {
      ...context(db),
      store: {
        ...db.store,
        stageGroceryChange: () => Effect.fail(new OfflineFailure({ reason: "storage" })),
      },
    },
    client(() => {
      calls++;
      return Effect.succeed(receipt);
    }),
    () => {},
  );
  t.after(() => blocked.dispose());
  await blocked.load();
  await blocked.save(change);
  assert.equal(calls, 1);
});

test("lost local receipt cleanup retains the exact retry and never claims completion", async (t) => {
  const db = await fixture(t);
  let broken = true,
    view,
    calls = 0;
  const store = {
    ...db.store,
    clearGroceryChange: (...args) =>
      broken
        ? Effect.fail(new OfflineFailure({ reason: "storage" }))
        : db.store.clearGroceryChange(...args),
  };
  const runtime = groceryEditor(
    { store, session: db.session },
    client(() => {
      calls++;
      return Effect.succeed(receipt);
    }),
    (next) => {
      view = next;
    },
  );
  t.after(() => runtime.dispose());
  await runtime.load();
  await runtime.save(change);
  assert.equal(view.saved, false);
  assert.deepEqual(view.pending, change);
  broken = false;
  await runtime.retry();
  assert.equal(calls, 2);
  assert.equal(view.saved, true);
});

test("authorization and conflict failures retain reviewable attempts until explicit discard", async (t) => {
  for (const code of ["forbidden", "conflict", "removed", "invalid"]) {
    const db = await fixture(t);
    let view;
    const runtime = groceryEditor(
      context(db),
      client(() => Effect.fail(new GroceryFailure({ code }))),
      (next) => {
        view = next;
      },
    );
    await runtime.load();
    await runtime.save(change);
    assert.equal(view.saved, false);
    assert.deepEqual(view.pending, change);
    await runtime.discard();
    assert.equal(view.pending, null);
    assert.equal(await run(db.store.readGroceryChange(db.session)), null);
    runtime.dispose();
  }
});

test("disposing an in-flight editor keeps the attempt and suppresses delayed publication", async (t) => {
  const db = await fixture(t);
  let release,
    count = 0;
  const runtime = groceryEditor(
    context(db),
    client(() =>
      Effect.promise(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      ),
    ),
    () => {
      count++;
    },
  );
  await runtime.load();
  const saving = runtime.save(change);
  await until(() => !!release);
  runtime.dispose();
  const before = count;
  release(receipt);
  await saving;
  assert.equal(count, before);
  assert.deepEqual(await run(db.store.readGroceryChange(db.session)), change);
});
async function until(condition) {
  for (let index = 0; index < 100; index++) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail("save did not reach deferred transport");
}

test("retained removal labels survive restart without changing the server command", async (t) => {
  const db = await fixture(t);
  const removal = {
    action: "remove",
    label: "Oat milk",
    command: { operationId: operation, itemId: target, expectedVersion: "3" },
  };
  await run(db.store.stageGroceryChange(db.session, removal));
  const reopened = db.reopen();
  assert.deepEqual(await run(reopened.store.readGroceryChange(db.session)), removal);
  const { groceryChangeSummary } = await import("../src/groceries/change-summary.ts");
  assert.equal(groceryChangeSummary(removal, []).title, "Remove: Oat milk");
  assert.equal(
    groceryChangeSummary({ action: "remove", command: removal.command }, []).title,
    `Remove: ${target}`,
  );
  const categorized = { ...change, command: { ...change.command, categoryId: target } };
  assert.deepEqual(
    groceryChangeSummary(categorized, [{ categoryId: target, name: "Dairy" }]).details,
    ["2 litres", "Dairy"],
  );
  assert.match(groceryChangeSummary(categorized, []).details[1], new RegExp(target));
});
