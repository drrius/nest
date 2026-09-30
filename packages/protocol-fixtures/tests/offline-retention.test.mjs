import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { acknowledgedLimit, unresolvedLimit } from "../src/offline/retention.ts";
import { fixture, run, account, grocery, operation, lease, target } from "./offline-fixture.mjs";
import { id, seedJournal, rows } from "./offline-retention-fixture.mjs";

test("activation bounds acknowledged history while preserving every unresolved row, its direct receipt and another account", async (t) => {
  const f = await fixture(t);
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.tuple(fc.integer({ min: 1, max: 80 }), fc.boolean()), {
        minLength: 1,
        maxLength: 20,
      }),
      async (dependencies) => {
        f.connection.exec("DELETE FROM offline_operations");
        seedJournal(f.connection, acknowledgedLimit + 80);
        seedJournal(f.connection, 30, { actor: id(888), offset: 5000 });
        for (const [index, [parent, conflict]] of dependencies.entries()) {
          seedJournal(f.connection, 1, {
            offset: 2000 + index,
            status: conflict ? "conflict" : "pending",
          });
          f.connection
            .prepare("UPDATE offline_operations SET predecessor=? WHERE operation=?")
            .run(id(parent), id(2000 + index));
        }
        const before = rows(f.connection),
          other = rows(f.connection, id(888));
        const unresolved = before.filter((row) => row.status !== "acknowledged");
        const required = new Set(unresolved.map((row) => row.predecessor));
        await run(f.store.activate(account, lease));
        const after = rows(f.connection),
          byId = new Map(after.map((row) => [row.operation, row]));
        for (const row of unresolved) assert.deepEqual(byId.get(row.operation), row);
        for (const parent of required)
          assert.deepEqual(
            byId.get(parent),
            before.find((row) => row.operation === parent),
          );
        assert.ok(
          after.filter((row) => row.status === "acknowledged").length <=
            acknowledgedLimit + required.size,
        );
        assert.deepEqual(rows(f.connection, id(888)), other);
        assert.equal(byId.has(id(1080)), true);
      },
    ),
    { numRuns: 40, seed: 7320 },
  );
});
test("old predecessor receipts survive restart and replay, then release after their last child acknowledges", async (t) => {
  const f = await fixture(t);
  await run(f.store.enqueue(f.session, grocery));
  await run(f.store.prepare(f.session));
  await run(f.store.acknowledge(f.session, { operation, version: "v2", value: true }));
  const next = { ...grocery, operation: id(5000), checked: false };
  await run(f.store.enqueue(f.session, next));
  const wire = await run(f.store.prepare(f.session));
  assert.equal(wire.expected, "v2");
  seedJournal(f.connection, acknowledgedLimit + 10);
  const reopened = f.reopen(),
    session = await run(reopened.store.activate(account, lease));
  assert.deepEqual(await run(reopened.store.prepare(session)), wire);
  assert.equal(
    rows(reopened.connection).some((row) => row.operation === operation),
    true,
  );
  await run(
    reopened.store.acknowledge(session, { operation: next.operation, version: "v3", value: false }),
  );
  assert.equal(
    rows(reopened.connection).some((row) => row.operation === operation),
    false,
  );
  assert.equal((await run(reopened.store.read(session))).items[0].version, "v3");
  assert.equal((await run(reopened.store.read(session))).pending.length, 0);
});
test("capacity rejects a new durable intent atomically, preserves duplicates and permits recovery after acknowledgment", async (t) => {
  const f = await fixture(t);
  seedJournal(f.connection, unresolvedLimit - 1, { status: "pending" });
  const results = await Promise.allSettled([
    run(f.store.enqueue(f.session, grocery)),
    run(f.store.enqueue(f.session, { ...grocery, operation: id(5001) })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.reason, "queue_full");
  const queued = rows(f.connection),
    real = queued.find((row) => row.target === target);
  await run(f.store.enqueue(f.session, JSON.parse(real.intent)));
  assert.deepEqual(rows(f.connection), queued);
  await assert.rejects(
    run(f.store.enqueue(f.session, { ...JSON.parse(real.intent), checked: false })),
    { reason: "operation_reused" },
  );
  await run(f.store.acknowledge(f.session, { operation: id(1), version: "v2", value: true }));
  await run(f.store.enqueue(f.session, { ...grocery, operation: id(6001) }));
  assert.equal((await run(f.store.read(f.session))).pending.length, unresolvedLimit);
});
test("pruning failure rolls back acknowledgment and canonical state; a failed activation leaves the old lease intact", async (t) => {
  const f = await fixture(t);
  seedJournal(f.connection, acknowledgedLimit + 1);
  await run(f.store.enqueue(f.session, grocery));
  const wire = await run(f.store.prepare(f.session)),
    before = rows(f.connection);
  f.connection.exec(
    `CREATE TRIGGER fixture_fail_prune BEFORE DELETE ON offline_operations BEGIN SELECT RAISE(ABORT,'fixture prune failed'); END;`,
  );
  await assert.rejects(
    run(f.store.acknowledge(f.session, { operation, version: "v2", value: true })),
    { reason: "storage" },
  );
  assert.deepEqual(rows(f.connection), before);
  assert.equal((await run(f.store.read(f.session))).items[0].version, "v1");
  assert.deepEqual(await run(f.store.prepare(f.session)), wire);
  await assert.rejects(run(f.store.activate(account, id(7000))), { reason: "storage" });
  assert.equal((await run(f.store.read(f.session))).pending.length, 1);
});
test("pruned receipt ancestry never silently rebases an old UI intent over newer canonical state", async (t) => {
  const f = await fixture(t);
  await run(f.store.enqueue(f.session, grocery));
  await run(f.store.prepare(f.session));
  await run(f.store.acknowledge(f.session, { operation, version: "v2", value: true }));
  seedJournal(f.connection, acknowledgedLimit + 1);
  await run(f.store.activate(account, lease));
  await run(f.store.enqueue(f.session, { ...grocery, operation: id(8000), checked: false }));
  assert.equal((await run(f.store.prepare(f.session))).expected, "v1");
  assert.equal((await run(f.store.read(f.session))).items[0].version, "v2");
});

test("upgrading an already over-limit queue retains every unresolved intent and blocks only new ones", async (t) => {
  const f = await fixture(t);
  seedJournal(f.connection, unresolvedLimit + 10, { status: "pending" });
  const before = rows(f.connection);
  const restarted = f.reopen(),
    session = await run(restarted.store.activate(account, lease));
  assert.deepEqual(rows(restarted.connection), before);
  await assert.rejects(run(restarted.store.enqueue(session, grocery)), { reason: "queue_full" });
  assert.deepEqual(rows(restarted.connection), before);
});
