import { fixtureChoreSnapshot } from "./chore-snapshot-fixture.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { choreClient, ChoreFailure } from "../src/chores/client.ts";
import { choreFlow } from "../src/chores/flow.ts";
import { choreRuntime } from "../src/chores/runtime.ts";
import { fixture, run, account, target, operation, lease } from "./offline-fixture.mjs";
const partner = "10000000-0000-4000-8000-000000000002";
const requestId = "60000000-0000-4000-8000-000000000001";
const chore = {
  occurrenceId: target,
  dueDate: "2026-09-20",
  title: "Kitchen",
  assigneeId: account.actor,
};
const members = [
  { actorId: account.actor, displayName: "A" },
  { actorId: partner, displayName: "B" },
];
const snapshot = { version: 1, householdId: account.household, members, transfers: [] };
const pending = {
  requestId,
  occurrenceId: target,
  dueDate: chore.dueDate,
  title: chore.title,
  fromMemberId: account.actor,
  toMemberId: partner,
};
const command = {
  operationId: operation,
  occurrenceId: target,
  expectedDueDate: chore.dueDate,
  recipientId: partner,
};
const receipt = {
  actorId: account.actor,
  householdId: account.household,
  operationId: operation,
  requestId,
  occurrenceId: target,
  dueDate: chore.dueDate,
  fromMemberId: account.actor,
  toMemberId: partner,
  action: "request",
  state: "pending",
};
const fail = (code) => Effect.fail(new ChoreFailure({ code }));
const client = choreClient(
  "https://fixture.invalid/",
  account,
  Effect.succeed({ user: { id: account.actor }, access_token: "fixture" }),
);
const fetchRun = (effect, fetch) =>
  run(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));
async function setup(t, remote = {}) {
  const local = await fixture(t),
    views = [];
  const flow = choreFlow(local.store, local.session, {
    list: () => Effect.succeed([chore]),
    snapshot: fixtureChoreSnapshot,
    listTransfers: () => Effect.succeed(snapshot),
    complete: () => assert.fail("completion dispatched"),
    skip: () => assert.fail("skip dispatched"),
    requestTransfer: () => Effect.succeed(receipt),
    respondTransfer: () => assert.fail("response dispatched"),
    ...remote,
  });
  const runtime = choreRuntime(flow, (view) => views.push(view));
  t.after(() => runtime.dispose());
  await runtime.refresh();
  return { ...local, runtime, views, view: () => views.at(-1) };
}
test("native handover client strictly binds both commands, every receipt identity and the account roster", async () => {
  assert.deepEqual(
    await fetchRun(client.requestTransfer(command), async (_url, init) => {
      assert.deepEqual(JSON.parse(init.body), command);
      return Response.json({ version: 1, receipt });
    }),
    receipt,
  );
  for (const patch of [
    { actorId: partner },
    { householdId: requestId },
    { operationId: requestId },
    { occurrenceId: requestId },
    { toMemberId: requestId },
    { dueDate: "2026-09-21" },
    { state: "accepted" },
    { hidden: true },
  ])
    await assert.rejects(
      fetchRun(client.requestTransfer(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
  const response = { operationId: operation, requestId, action: "accept" };
  const accepted = {
    ...receipt,
    fromMemberId: partner,
    toMemberId: account.actor,
    action: "accept",
    state: "accepted",
  };
  assert.deepEqual(
    await fetchRun(client.respondTransfer(response), async () =>
      Response.json({ version: 1, receipt: accepted }),
    ),
    accepted,
  );
  for (const patch of [{ requestId: target }, { action: "decline", state: "declined" }])
    await assert.rejects(
      fetchRun(client.respondTransfer(response), async () =>
        Response.json({ version: 1, receipt: { ...accepted, ...patch } }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    fetchRun(client.requestTransfer({ ...command, actorId: partner }), () =>
      assert.fail("invalid dispatch"),
    ),
    { code: "invalid" },
  );
  for (const patch of [
    { householdId: requestId },
    { members: [{ actorId: partner, displayName: "B" }] },
    { transfers: [pending, pending] },
    { transfers: [{ ...pending, toMemberId: requestId }] },
  ])
    await assert.rejects(
      fetchRun(client.listTransfers(), async () => Response.json({ ...snapshot, ...patch })),
      { code: "unavailable" },
    );
});
test("uncertain requests freeze exact consent intent, block other chores and never enter the outbox", async (t) => {
  const calls = [];
  let available = false;
  const f = await setup(t, {
    requestTransfer: (input) => {
      calls.push(input);
      return available ? Effect.succeed(receipt) : fail("unavailable");
    },
  });
  const mutable = { ...chore };
  await f.runtime.requestTransfer(mutable, operation);
  mutable.dueDate = "2026-10-01";
  assert.equal(f.view().changeStage, "uncertain");
  assert.equal(f.view().pendingWrite, true);
  await f.runtime.skip(chore, requestId);
  await f.runtime.complete(chore, requestId, chore.dueDate);
  await f.runtime.requestTransfer(chore, requestId);
  assert.equal(calls.length, 1);
  assert.deepEqual((await run(f.store.readChores(f.session))).pending, []);
  available = true;
  await f.runtime.retryChange();
  assert.deepEqual(calls, [command, command]);
  assert.equal(f.view().pendingWrite, false);
  assert.equal(f.view().changeStage, "ready");
});
test("only current incoming requests can be answered; conflict requires reload and denied retries hide cached data", async (t) => {
  const incoming = { ...pending, fromMemberId: partner, toMemberId: account.actor };
  let state = "unavailable";
  const calls = [];
  const f = await setup(t, {
    list: () => Effect.succeed([{ ...chore, assigneeId: partner }]),
    snapshot: fixtureChoreSnapshot,
    listTransfers: () => Effect.succeed({ ...snapshot, transfers: [incoming] }),
    respondTransfer: (input) => {
      calls.push(input);
      return fail(state);
    },
  });
  await f.runtime.respondTransfer(incoming, "accept", operation);
  assert.equal(f.view().changeStage, "uncertain");
  await f.runtime.respondTransfer(incoming, "decline", requestId);
  assert.equal(calls.length, 1);
  state = "conflict";
  await f.runtime.retryChange();
  assert.deepEqual(calls[1], calls[0]);
  assert.equal(f.view().changeStage, "reload");
  assert.equal(f.view().pendingWrite, false);
  await f.runtime.refresh();
  state = "forbidden";
  await f.runtime.respondTransfer(incoming, "decline", requestId);
  assert.equal(f.view().access, "verify");
  assert.equal(f.view().data, null);
});
test("outgoing responses, shared/other ownership, stale reads and queued completion cannot initiate handovers", async (t) => {
  for (const assigneeId of [null, partner]) {
    const f = await setup(t, {
      list: () => Effect.succeed([{ ...chore, assigneeId }]),
      requestTransfer: () => assert.fail("wrong owner dispatched"),
    });
    await f.runtime.requestTransfer(chore, operation);
    assert.equal(f.view().changeStage, "reload");
  }
  const f = await setup(t, {
    snapshot: fixtureChoreSnapshot,
    listTransfers: () => Effect.succeed({ ...snapshot, transfers: [pending] }),
  });
  await f.runtime.respondTransfer(pending, "accept", operation);
  assert.equal(f.view().changeStage, "reload");
  const g = await setup(t, {
    complete: () => fail("unavailable"),
    requestTransfer: () => assert.fail("queued handover dispatched"),
  });
  await g.runtime.complete(chore, operation, chore.dueDate);
  await g.runtime.requestTransfer(chore, requestId);
  assert.equal((await run(g.store.readChores(g.session))).pending.length, 1);
  assert.equal(g.view().changeStage, "reload");
});
test("handover cache survives SQLite restart, isolates accounts and rolls back invalid snapshots atomically", async (t) => {
  const f = await fixture(t),
    saved = { ...snapshot, transfers: [pending] };
  await run(f.store.saveChores(f.session, [chore], saved));
  await assert.rejects(run(f.store.saveChores(f.session, [], { ...saved, householdId: target })), {
    reason: "invalid_input",
  });
  assert.equal((await run(f.store.readChores(f.session))).chores.length, 1);
  const restarted = f.reopen();
  const session = await run(restarted.store.activate(account, lease));
  assert.deepEqual((await run(restarted.store.readChores(session))).transfers, saved);
  const other = await run(restarted.store.activate({ ...account, actor: partner }, requestId));
  assert.equal((await run(restarted.store.readChores(other))).transfers, null);
});

test("native refresh uses one coherent snapshot request and rejects mixed or wrong-account snapshots", async (t) => {
  const local = await fixture(t);
  const wire = { ...snapshot, chores: [chore], transfers: [pending] };
  const calls = [];
  const flow = choreFlow(local.store, local.session, client);
  await fetchRun(flow.sync, async (url) => {
    calls.push(new URL(url).pathname);
    return Response.json(wire);
  });
  assert.deepEqual(calls, ["/v1/chores/snapshot"]);
  const saved = await run(flow.read);
  assert.equal(saved.chores[0].assigneeId, pending.fromMemberId);
  assert.deepEqual(saved.transfers.transfers, [pending]);
  for (const patch of [
    { householdId: requestId },
    { members: [{ actorId: partner, displayName: "B" }] },
    { chores: [{ ...chore, assigneeId: partner }] },
    { chores: [] },
    { chores: [chore, chore] },
    { transfers: [pending, pending] },
    { transfers: [{ ...pending, dueDate: "2026-09-21" }] },
    { hidden: true },
  ])
    await assert.rejects(
      fetchRun(flow.sync, async () => Response.json({ ...wire, ...patch })),
      { code: "unavailable" },
    );
  assert.deepEqual(await run(flow.read), saved);
});
