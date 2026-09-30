import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { offlineOwner } from "../src/offline/owner.ts";
import { account, connect, grocery, operation, run, target } from "./offline-fixture.mjs";
const partner = { ...account, actor: "10000000-0000-4000-8000-000000000002" };
const deferred = () => Promise.withResolvers();
async function setup(t, decorate = (value) => value) {
  const directory = await mkdtemp(join(tmpdir(), "nest-owner-"));
  const path = join(directory, "offline.sqlite");
  const connections = [];
  const owner = offlineOwner(async () => {
    const connected = connect(path);
    const entry = { closed: false, context: connected };
    connections.push(entry);
    return decorate(
      {
        database: connected.database,
        idle: connected.idle,
        close: async () => {
          connected.connection.close();
          entry.closed = true;
        },
      },
      connections.length,
    );
  }, randomUUID);
  t.after(async () => {
    await owner.select(null);
    await rm(directory, { recursive: true, force: true });
  });
  return { owner, connections };
}
const ready = async (owner, identity = account) => {
  const states = [];
  await owner.select(identity, (state) => states.push(state));
  assert.equal(states.at(-1).status, "ready");
  return states.at(-1).account;
};
async function seed(current) {
  await run(
    current.store.saveSnapshot(current.session, [
      { kind: grocery.kind, target, version: "v1", value: 0 },
    ]),
  );
  await run(current.store.enqueue(current.session, grocery));
}

test("two consumers share one lease and queued work survives releasing then reopening the account", async (t) => {
  const { owner, connections } = await setup(t);
  const current = await ready(owner);
  await seed(current);
  const first = await run(current.store.prepare(current.session, "groceries.setChecked"));
  assert.equal(first.operation, operation);
  assert.equal((await run(current.store.read(current.session))).pending.length, 1);
  assert.equal(connections.length, 1);
  await owner.select(null);
  assert.equal(connections[0].closed, true);
  const reopened = await ready(owner);
  assert.notEqual(reopened.session.lease, current.session.lease);
  assert.equal(
    (await run(reopened.store.prepare(reopened.session, "groceries.setChecked"))).operation,
    operation,
  );
});

test("delayed old opening never publishes or overwrites a newer account lease", async (t) => {
  const entered = deferred(),
    resume = deferred();
  const { owner, connections } = await setup(t, async (connection, index) => {
    if (index === 1) {
      entered.resolve();
      await resume.promise;
    }
    return connection;
  });
  const oldStates = [],
    newStates = [];
  const first = owner.select(account, (state) => oldStates.push(state));
  await entered.promise;
  const second = owner.select(partner, (state) => newStates.push(state));
  assert.equal(connections.length, 1);
  resume.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(
    oldStates.map((state) => state.status),
    ["loading"],
  );
  assert.equal(connections[0].closed, true);
  const current = newStates.at(-1).account;
  assert.equal(current.session.actor, partner.actor);
  assert.equal((await run(current.store.read(current.session))).pending.length, 0);
  assert.equal(connections.length, 2);
});

test("an in-flight stale activation is suspended before the new identity can open", async (t) => {
  const entered = deferred(),
    resume = deferred();
  const { owner } = await setup(t, (connection, index) => {
    if (index !== 1) return connection;
    let transactions = 0;
    const database = {
      transaction: async (body) => {
        if (++transactions === 2) {
          entered.resolve();
          await resume.promise;
        }
        return connection.database.transaction(body);
      },
    };
    return { ...connection, database };
  });
  const states = [];
  const first = owner.select(account, (state) => states.push(state));
  await entered.promise;
  const next = ready(owner, partner);
  resume.resolve();
  await first;
  const current = await next;
  assert.deepEqual(
    states.map((state) => state.status),
    ["loading"],
  );
  assert.equal(current.session.actor, partner.actor);
  assert.equal((await run(current.store.read(current.session))).pending.length, 0);
});

test("close failure blocks replacement and a retry completes cleanup before opening again", async (t) => {
  let failures = 1;
  const { owner, connections } = await setup(t, (connection, index) => ({
    ...connection,
    close: async () => {
      if (index === 1 && failures-- > 0) throw new Error("fixture close failed");
      await connection.close();
    },
  }));
  const current = await ready(owner);
  await seed(current);
  const states = [];
  await owner.select(partner, (state) => states.push(state));
  assert.equal(states.at(-1).status, "error");
  assert.equal(connections.length, 1);
  await assert.rejects(
    run(current.store.read(current.session)),
    (error) => error.reason === "session_changed",
  );
  const next = await ready(owner, partner);
  assert.equal(connections[0].closed, true);
  assert.equal(connections.length, 2);
  assert.equal((await run(next.store.read(next.session))).pending.length, 0);
  const original = await ready(owner);
  assert.equal((await run(original.store.read(original.session))).pending.length, 1);
});

test("initialization failure closes the resource and can recover without losing account scoping", async (t) => {
  const { owner, connections } = await setup(t, (connection, index) =>
    index !== 1
      ? connection
      : {
          ...connection,
          database: {
            transaction: () => Promise.reject(new Error("fixture initialization failed")),
          },
        },
  );
  const states = [];
  await owner.select(account, (state) => states.push(state));
  assert.equal(states.at(-1).status, "error");
  assert.equal(connections[0].closed, true);
  const current = await ready(owner);
  assert.equal(current.session.actor, account.actor);
  assert.equal(connections.length, 2);
});

test("rapid setup-cleanup-setup skips obsolete work and maintains one live connection", async (t) => {
  const { owner, connections } = await setup(t);
  const old = [];
  const first = owner.select(account, (state) => old.push(state));
  const cleanup = owner.select(null);
  const current = await ready(owner);
  await Promise.all([first, cleanup]);
  assert.equal(connections.length, 1);
  assert.deepEqual(
    old.map((state) => state.status),
    ["loading"],
  );
  await seed(current);
  assert.equal((await run(current.store.read(current.session))).pending.length, 1);
});
