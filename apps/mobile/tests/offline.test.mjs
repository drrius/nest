import assert from "node:assert/strict";
import test from "node:test";
import { account, fixture, grocery, operation, run, target } from "./offline-fixture.mjs";

const nextOperation = "50000000-0000-4000-8000-000000000002";
const nextLease = "30000000-0000-4000-8000-000000000002";
const fails = (effect, reason) => assert.rejects(run(effect), (error) => error.reason === reason);

test("a durable intent and its pending projection survive closing and reopening SQLite", async (t) => {
  const f = await fixture(t);
  await run(f.store.enqueue(f.session, grocery));
  const { store } = f.reopen();
  const session = await run(store.activate(account, nextLease));
  const view = await run(store.read(session));
  assert.equal(view.items[0].value, 1);
  assert.equal(view.items[0].pending, true);
  assert.equal(view.pending[0].operation, operation);
  await fails(store.read(f.session), "session_changed");
});

test("lost acknowledgments resend the exact wire command and reconcile atomically", async (t) => {
  const f = await fixture(t);
  await run(f.store.enqueue(f.session, grocery));
  const sent = await run(f.store.prepare(f.session));
  const { store } = f.reopen();
  assert.deepEqual(await run(store.prepare(f.session)), sent);
  await run(store.acknowledge(f.session, { operation, version: "v2", value: true }));
  await run(store.acknowledge(f.session, { operation, version: "v2", value: true }));
  const view = await run(store.read(f.session));
  assert.equal(view.pending.length, 0);
  assert.equal(view.items[0].version, "v2");
  assert.equal(await run(store.prepare(f.session)), null);
});

test("queued check and uncheck use predecessor canonical version, including no-op acknowledgments", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.enqueue(session, grocery));
  await run(store.enqueue(session, { ...grocery, operation: nextOperation, checked: false }));
  assert.equal((await run(store.read(session))).items[0].value, 0);
  assert.equal((await run(store.prepare(session))).operation, operation);
  await run(store.acknowledge(session, { operation, version: "v1", value: true }));
  const next = await run(store.prepare(session));
  assert.equal(next.operation, nextOperation);
  assert.equal(next.expected, "v1");
  assert.equal(next.checked, false);
});

test("conflicts preserve both intents and block their dependent replay", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.enqueue(session, grocery));
  await run(store.enqueue(session, { ...grocery, operation: nextOperation, checked: false }));
  await run(store.prepare(session));
  await run(store.conflict(session, operation, "changed"));
  assert.equal(await run(store.prepare(session)), null);
  const view = await run(store.read(session));
  assert.equal(view.pending.length, 2);
  assert.equal(view.pending[0].reason, "changed");
});

test("logout pauses old sessions; another account cannot read or replay their pending work", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.enqueue(session, grocery));
  await run(store.suspend(session));
  await fails(store.prepare(session), "session_changed");
  const other = await run(
    store.activate({ ...account, actor: "10000000-0000-4000-8000-000000000002" }, nextLease),
  );
  assert.deepEqual(await run(store.read(other)), { items: [], pending: [] });
  assert.equal(await run(store.prepare(other)), null);
  await fails(
    store.acknowledge(session, { operation, version: "v2", value: true }),
    "session_changed",
  );
  const restored = await run(store.activate(account, "30000000-0000-4000-8000-000000000003"));
  assert.equal((await run(store.read(restored))).pending.length, 1);
});

test("operation identities reject payload changes, and unsupported offline actions are rejected", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.enqueue(session, grocery));
  await run(store.enqueue(session, grocery));
  await fails(store.enqueue(session, { ...grocery, checked: false }), "operation_reused");
  await fails(
    store.enqueue(session, { ...grocery, kind: "money.expense.create" }),
    "invalid_input",
  );
  await fails(store.enqueue(session, { ...grocery, kind: "ai.send" }), "invalid_input");
  assert.equal((await run(store.read(session))).pending.length, 1);
});

test("a failed durable enqueue never exposes an optimistic success", async (t) => {
  const { store, session, connection } = await fixture(t);
  connection.exec(`CREATE TRIGGER fail_enqueue BEFORE INSERT ON offline_operations
    BEGIN SELECT RAISE(ABORT, 'disk failure fixture'); END`);
  await fails(store.enqueue(session, grocery), "storage");
  const view = await run(store.read(session));
  assert.equal(view.pending.length, 0);
  assert.equal(view.items[0].value, 0);
});

test("receipt failure rolls back both acknowledgment and canonical projection", async (t) => {
  const { store, session, connection } = await fixture(t);
  await run(store.enqueue(session, grocery));
  await run(store.prepare(session));
  connection.exec(`CREATE TRIGGER fail_receipt BEFORE UPDATE ON offline_items
    BEGIN SELECT RAISE(ABORT, 'disk failure fixture'); END`);
  await fails(store.acknowledge(session, { operation, version: "v2", value: true }), "storage");
  assert.equal((await run(store.read(session))).pending.length, 1);
  assert.equal((await run(store.prepare(session))).expected, "v1");
});

test("snapshot removal preserves pending intent without resurrecting the deleted item", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.enqueue(session, grocery));
  await run(store.saveSnapshot(session, []));
  const view = await run(store.read(session));
  assert.equal(view.items.length, 0);
  assert.equal(view.pending.length, 1);
  await run(store.prepare(session));
  await run(store.conflict(session, operation, "removed"));
  assert.equal(await run(store.prepare(session)), null);
});

test("a chore occurrence is persisted with its original date/version and cannot claim false completion", async (t) => {
  const { store, session } = await fixture(t);
  await run(
    store.saveSnapshot(session, [
      { kind: "chore.complete", target, version: "2026-09-19", value: 0 },
    ]),
  );
  const intent = {
    operation,
    kind: "chore.complete",
    target,
    expected: "2026-09-19",
    completedOn: "2026-09-19",
  };
  await run(store.enqueue(session, intent));
  assert.deepEqual(await run(store.prepare(session)), intent);
  await fails(
    store.acknowledge(session, { operation, version: "v2", value: false }),
    "invalid_receipt",
  );
});

test("concurrent duplicate enqueue commits once and a malformed snapshot cannot erase cached state", async (t) => {
  const { store, session } = await fixture(t);
  await Promise.all([run(store.enqueue(session, grocery)), run(store.enqueue(session, grocery))]);
  await fails(
    store.saveSnapshot(session, [
      { kind: "money.expense.create", target, version: "v1", value: 0 },
    ]),
    "invalid_input",
  );
  const view = await run(store.read(session));
  assert.equal(view.pending.length, 1);
  assert.equal(view.items.length, 1);
});

test("the same actor in another household cannot read the first household queue", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.enqueue(session, grocery));
  const other = await run(
    store.activate({ ...account, household: "20000000-0000-4000-8000-000000000002" }, nextLease),
  );
  assert.deepEqual(await run(store.read(other)), { items: [], pending: [] });
  assert.equal(await run(store.prepare(other)), null);
});

test("impossible chore dates never enter the durable queue, while leap days survive replay", async (t) => {
  const { store, session } = await fixture(t);
  await run(
    store.saveSnapshot(session, [
      { kind: "chore.complete", target, version: "2024-02-29", value: 0 },
    ]),
  );
  const intent = { operation, kind: "chore.complete", target, expected: "2024-02-29" };
  for (const completedOn of [
    "2026-99-99",
    "2026-02-29",
    "2024-04-31",
    "0000-01-01",
    "2024-00-01",
    "2024-01-00",
  ]) {
    await fails(store.enqueue(session, { ...intent, completedOn }), "invalid_input");
  }
  assert.equal((await run(store.read(session))).pending.length, 0);
  assert.equal(await run(store.prepare(session)), null);
  await run(store.enqueue(session, { ...intent, completedOn: "2024-02-29" }));
  assert.equal((await run(store.prepare(session))).completedOn, "2024-02-29");
});
