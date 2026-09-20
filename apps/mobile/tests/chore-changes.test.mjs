import { fixtureChoreSnapshot } from "./chore-snapshot-fixture.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { choreClient, ChoreFailure } from "../src/chores/client.ts";
import { choreRuntime } from "../src/chores/runtime.ts";
import { choreFlow } from "../src/chores/flow.ts";
import { emptyTransfers, fixture, run, account, target, operation } from "./offline-fixture.mjs";
const chore = { occurrenceId: target, dueDate: "2026-09-20", title: "Plants", assigneeId: null };
const command = { operationId: operation, occurrenceId: target, expectedDueDate: chore.dueDate };
const receipt = {
  actorId: account.actor,
  householdId: account.household,
  ...command,
  previousDueDate: chore.dueDate,
  dueDate: chore.dueDate,
  action: "skip",
  status: "skipped",
};
delete receipt.expectedDueDate;
const fail = (code) => Effect.fail(new ChoreFailure({ code }));
const client = choreClient(
  "https://fixture.invalid/",
  account,
  Effect.succeed({ user: { id: account.actor }, access_token: "fixture" }),
);
const fetchRun = (effect, fetch) =>
  run(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("chore change client binds every receipt field and rejects malformed inputs before dispatch", async () => {
  for (const action of ["skip", "reschedule"]) {
    const input = action === "skip" ? command : { ...command, newDueDate: "2026-09-22" };
    const saved =
      action === "skip"
        ? receipt
        : { ...receipt, action, status: "open", dueDate: input.newDueDate };
    assert.deepEqual(
      await fetchRun(client[action](input), async (url, init) => {
        assert.equal(new URL(url).pathname, `/v1/chores/${action}`);
        assert.equal(new Headers(init.headers).get("X-Nest-Household"), account.household);
        assert.deepEqual(JSON.parse(init.body), input);
        return Response.json({ version: 1, receipt: saved });
      }),
      saved,
    );
    for (const patch of [
      { actorId: target },
      { householdId: target },
      { operationId: target },
      { occurrenceId: operation },
      { previousDueDate: "2026-09-19" },
      { dueDate: "2026-09-23" },
      { action: "complete" },
      { status: "completed" },
      { extra: true },
    ]) {
      await assert.rejects(
        fetchRun(client[action](input), async () =>
          Response.json({ version: 1, receipt: { ...saved, ...patch } }),
        ),
        { code: "unavailable" },
      );
    }
  }
  for (const input of [
    { ...command, actorId: target },
    { ...command, expectedDueDate: "2026-02-30" },
  ])
    await assert.rejects(
      fetchRun(client.skip(input), () => assert.fail("dispatch")),
      { code: "invalid" },
    );
  await assert.rejects(
    fetchRun(client.reschedule({ ...command, newDueDate: chore.dueDate }), () =>
      assert.fail("dispatch"),
    ),
    { code: "invalid" },
  );
});
async function setup(t, remote) {
  const { store, session } = await fixture(t);
  const views = [];
  const runtime = choreRuntime(
    choreFlow(store, session, {
      snapshot: fixtureChoreSnapshot,
      listTransfers: () => Effect.succeed(emptyTransfers),
      list: () => Effect.succeed([chore]),
      complete: () => assert.fail("completion dispatch"),
      ...remote,
    }),
    (view) => views.push(view),
  );
  t.after(() => runtime.dispose());
  await runtime.refresh();
  return { runtime, store, session, view: () => views.at(-1), views };
}
test("uncertain online reschedule freezes the attempt, blocks other writes and never enters SQLite outbox", async (t) => {
  const calls = [];
  let rows = [chore];
  const f = await setup(t, {
    list: () => Effect.succeed(rows),
    reschedule: (input) => {
      calls.push({ ...input });
      rows = [{ ...chore, dueDate: input.newDueDate }];
      return calls.length === 1 ? fail("unavailable") : Effect.succeed({ action: "reschedule" });
    },
    skip: () => assert.fail("replacement skip"),
  });
  const source = { ...chore };
  await f.runtime.reschedule(source, operation, "2026-09-22");
  source.dueDate = "2026-10-01";
  assert.equal(f.view().changeStage, "uncertain");
  assert.equal(f.view().pendingWrite, true);
  await f.runtime.skip(chore, target);
  await f.runtime.reschedule(source, target, "2026-10-02");
  await f.runtime.complete(chore, target, chore.dueDate);
  await f.runtime.refresh();
  assert.equal(f.view().data.chores[0].dueDate, chore.dueDate);
  assert.deepEqual((await run(f.store.readChores(f.session))).pending, []);
  await f.runtime.retryChange();
  assert.deepEqual(calls, [
    { ...command, newDueDate: "2026-09-22" },
    { ...command, newDueDate: "2026-09-22" },
  ]);
  assert.equal(f.view().data.chores[0].dueDate, "2026-09-22");
  assert.equal(f.view().changeStage, "ready");
  assert.equal(f.view().pendingWrite, false);
});
test("confirmed write with failed refresh only reloads; terminal conflict requires a fresh baseline", async (t) => {
  let writes = 0,
    readFailure = false,
    conflict = false;
  const f = await setup(t, {
    list: () => (readFailure ? fail("unavailable") : Effect.succeed([chore])),
    skip: () => {
      writes++;
      readFailure = true;
      return conflict ? fail("conflict") : Effect.succeed(receipt);
    },
  });
  await f.runtime.skip(chore, operation);
  assert.equal(f.view().changeStage, "reload");
  assert.equal(f.view().pendingWrite, false);
  assert.match(f.view().changeNotice, /skipped/);
  await f.runtime.retryChange();
  await f.runtime.skip(chore, target);
  assert.equal(writes, 1);
  readFailure = false;
  await f.runtime.refresh();
  conflict = true;
  await f.runtime.skip(chore, target);
  assert.equal(f.view().changeStage, "reload");
  assert.equal(f.view().changed, 2);
  await f.runtime.retryChange();
  assert.equal(writes, 2);
});
test("revocation clears private view and retry details; network failure cannot undo denial", async (t) => {
  let readFailure = false;
  const f = await setup(t, {
    list: () => (readFailure ? fail("unavailable") : Effect.succeed([chore])),
    skip: () => fail("forbidden"),
  });
  await f.runtime.skip(chore, operation);
  assert.equal(f.view().data, null);
  assert.equal(f.view().access, "verify");
  assert.equal(f.view().pendingWrite, false);
  readFailure = true;
  await f.runtime.refresh();
  assert.equal(f.view().access, "verify");
  await f.runtime.retryChange();
  assert.deepEqual((await run(f.store.readChores(f.session))).pending, []);
});
test("pending completion, stale cache, invalid date and same-frame double tap cannot start another online write", async (t) => {
  let readsFail = false,
    writes = 0;
  const f = await setup(t, {
    list: () => (readsFail ? fail("unavailable") : Effect.succeed([chore])),
    complete: () => fail("unavailable"),
    skip: () => {
      writes++;
      return fail("unavailable");
    },
    reschedule: () => assert.fail("invalid date dispatch"),
  });
  await f.runtime.reschedule(chore, operation, chore.dueDate);
  assert.equal(f.view().pendingWrite, false);
  readsFail = true;
  await f.runtime.refresh();
  await f.runtime.skip(chore, operation);
  assert.equal(writes, 0);
  readsFail = false;
  await f.runtime.refresh();
  await Promise.all([f.runtime.skip(chore, operation), f.runtime.skip(chore, target)]);
  assert.equal(writes, 1);
  const g = await setup(t, {
    complete: () => fail("unavailable"),
    skip: () => assert.fail("pending completion"),
  });
  await g.runtime.complete(chore, operation, chore.dueDate);
  await g.runtime.refresh();
  await g.runtime.skip(chore, target);
  assert.equal((await run(g.store.readChores(g.session))).pending.length, 1);
});
test("disposing during an online write prevents late publication and does not enqueue a retry", async (t) => {
  let release, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const f = await setup(t, {
    skip: () =>
      Effect.promise(
        () =>
          new Promise((resolve) => {
            release = resolve;
            entered();
          }),
      ),
  });
  const pending = f.runtime.skip(chore, operation);
  await started;
  f.runtime.dispose();
  const count = f.views.length;
  release(receipt);
  await pending;
  assert.equal(f.views.length, count);
  assert.deepEqual((await run(f.store.readChores(f.session))).pending, []);
});

test("online skip refuses credentials belonging to a switched account", async () => {
  const switched = choreClient(
    "https://fixture.invalid/",
    account,
    Effect.succeed({ user: { id: target }, access_token: "wrong" }),
  );
  await assert.rejects(
    fetchRun(switched.skip(command), () => assert.fail("cross-account dispatch")),
    { code: "session" },
  );
});
