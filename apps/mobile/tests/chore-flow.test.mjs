import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import { choreFlow } from "../src/chores/flow.ts";
import { ChoreFailure } from "../src/chores/client.ts";
import { choreRuntime } from "../src/chores/runtime.ts";
import {
  fixture,
  run,
  account,
  operation,
  target,
  lease,
  emptyTransfers,
} from "./offline-fixture.mjs";
const chore = {
  occurrenceId: target,
  dueDate: "2026-09-20",
  title: "Water plants",
  assigneeId: null,
};
const operation2 = "50000000-0000-4000-8000-000000000002";
const client = (rows = [chore]) => ({
  listTransfers: () => Effect.succeed(emptyTransfers),
  list: () => Effect.succeed(rows),
  complete: (command) =>
    Effect.succeed({ ...command, version: 1, completedBy: account.actor, outcome: "completed" }),
});

test("chore snapshots are atomic, preserve groceries and distinguish never-loaded from empty", async (t) => {
  const { store, session } = await fixture(t);
  assert.equal((await run(store.readChores(session))).loaded, false);
  await run(store.saveChores(session, [chore]));
  assert.equal((await run(store.read(session))).items.length, 2);
  await assert.rejects(run(store.saveChores(session, [chore, chore])), { reason: "storage" });
  assert.equal((await run(store.readChores(session))).chores.length, 1);
  await run(store.saveChores(session, []));
  assert.deepEqual(await run(store.readChores(session)), {
    loaded: true,
    chores: [],
    pending: [],
    transfers: null,
  });
  assert.equal((await run(store.read(session))).items.length, 1);
});

test("a lost acknowledgment survives restart and replays the original command once", async (t) => {
  const f = await fixture(t);
  const calls = [];
  const receipts = new Map();
  let lose = true;
  const remote = {
    ...client(),
    complete: (command) =>
      Effect.suspend(() => {
        calls.push(command);
        if (!receipts.has(command.operationId))
          receipts.set(command.operationId, {
            ...command,
            version: 1,
            completedBy: account.actor,
            outcome: "completed",
          });
        if (lose) return Effect.fail(new ChoreFailure({ code: "unavailable" }));
        return Effect.succeed(receipts.get(command.operationId));
      }),
  };
  let flow = choreFlow(f.store, f.session, remote);
  await run(flow.sync);
  await run(flow.complete(chore, operation, "2026-09-20"));
  await assert.rejects(run(flow.sync), { code: "unavailable" });
  const wire = (await run(f.store.read(f.session))).pending[0].wire;
  assert.ok(wire);
  const restarted = f.reopen();
  const session = await run(restarted.store.activate(account, operation2));
  lose = false;
  flow = choreFlow(restarted.store, session, remote);
  assert.equal((await run(flow.read)).chores[0].pending, true);
  await run(flow.sync);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(receipts.size, 1);
  assert.equal((await run(flow.read)).pending.length, 0);
});

test("conflicts remain visible until explicitly discarded, then a new completion uses the new date", async (t) => {
  const { store, session } = await fixture(t);
  let conflict = true;
  const calls = [];
  const remote = {
    listTransfers: () => Effect.succeed(emptyTransfers),
    list: () => Effect.succeed([{ ...chore, dueDate: "2026-09-21" }]),
    complete: (command) => {
      calls.push(command);
      return conflict
        ? Effect.fail(new ChoreFailure({ code: "conflict" }))
        : client().complete(command);
    },
  };
  await run(store.saveChores(session, [chore]));
  const flow = choreFlow(store, session, remote);
  await run(flow.complete(chore, operation, "2026-09-20"));
  await run(flow.sync);
  let data = await run(flow.read);
  assert.equal(data.pending[0].status, "conflict");
  assert.equal(data.chores[0].done, false);
  await run(flow.sync);
  assert.equal(calls.length, 1);
  await run(flow.discard(operation));
  conflict = false;
  data = await run(flow.read);
  await run(flow.complete(data.chores[0], operation2, "2026-09-21"));
  await run(flow.sync);
  assert.equal(calls[1].expectedDueDate, "2026-09-21");
  assert.notEqual(calls[0].operationId, calls[1].operationId);
});

test("an uncertain pending mutation cannot be discarded as a rejected conflict", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.saveChores(session, [chore]));
  const flow = choreFlow(store, session, client());
  await run(flow.complete(chore, operation, "2026-09-20"));
  await store.prepare(session).pipe(run);
  await assert.rejects(run(flow.discard(operation)), { reason: "invalid_input" });
  assert.equal((await run(flow.read)).pending.length, 1);
});

test("account activation hides cached chores and blocks old callbacks without deleting the owner's queue", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.saveChores(session, [chore]));
  const flow = choreFlow(store, session, client());
  await run(flow.complete(chore, operation, "2026-09-20"));
  const other = await run(store.activate({ ...account, actor: operation2 }, operation2));
  assert.equal((await run(store.readChores(other))).loaded, false);
  assert.equal((await run(store.readChores(other))).pending.length, 0);
  await assert.rejects(run(flow.sync), { reason: "session_changed" });
  const restored = await run(store.activate(account, lease));
  assert.equal((await run(store.readChores(restored))).pending.length, 1);
});

test("failed refresh preserves loaded data and same-frame double taps enqueue one durable intent", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.saveChores(session, [chore]));
  const fail = () => Effect.fail(new ChoreFailure({ code: "unavailable" }));
  const views = [];
  const runtime = choreRuntime(choreFlow(store, session, { list: fail, complete: fail }), (view) =>
    views.push(view),
  );
  t.after(() => runtime.dispose());
  await runtime.refresh();
  assert.equal(views.at(-1).data.loaded, true);
  assert.equal(views.at(-1).stale, true);
  await Promise.all([
    runtime.complete(chore, operation, "2026-09-20"),
    runtime.complete(chore, operation2, "2026-09-20"),
  ]);
  await runtime.refresh();
  assert.equal(views.at(-1).data.pending.length, 1);
  assert.equal(views.at(-1).data.chores[0].done, true);
  assert.match(views.at(-1).error, /Saved changes are kept/);
});

test("known membership denial blocks further completion while keeping uncertain attempts", async (t) => {
  const { store, session } = await fixture(t);
  await run(store.saveChores(session, [chore]));
  const views = [];
  let code = "forbidden";
  const denied = () => (code ? Effect.fail(new ChoreFailure({ code })) : Effect.succeed([chore]));
  const runtime = choreRuntime(
    choreFlow(store, session, { ...client(), list: denied, complete: denied }),
    (view) => views.push(view),
  );
  t.after(() => runtime.dispose());
  await runtime.refresh();
  assert.equal(views.at(-1).access, "verify");
  code = "unavailable";
  await runtime.refresh();
  assert.equal(views.at(-1).access, "verify");
  await runtime.complete(chore, operation, "2026-09-20");
  assert.equal((await run(store.readChores(session))).pending.length, 0);
  code = null;
  await runtime.refresh();
  assert.equal(views.at(-1).access, "allowed");
});

test("disposing the native controller cancels an in-flight read without publishing another account's data", async (t) => {
  const { store, session } = await fixture(t);
  let started;
  const entering = new Promise((resolve) => {
    started = resolve;
  });
  const remote = {
    ...client(),
    listTransfers: () => Effect.succeed(emptyTransfers),
    list: () =>
      Effect.promise(
        (signal) =>
          new Promise((resolve) => {
            signal.addEventListener("abort", () => resolve([chore]), { once: true });
            started();
          }),
      ),
  };
  const views = [];
  const runtime = choreRuntime(choreFlow(store, session, remote), (view) => views.push(view));
  const pending = runtime.refresh();
  await entering;
  runtime.dispose();
  const count = views.length;
  await pending;
  assert.equal(views.length, count);
  assert.equal((await run(store.readChores(session))).loaded, false);
});
