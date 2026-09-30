import assert from "node:assert/strict";
import { test } from "node:test";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Exit from "effect/Exit";
import * as TestClock from "effect/testing/TestClock";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mealClient } from "../src/meals/client.ts";
import { account, command, receipt, ready, id } from "./meal-proposal-fixture.mjs";
const credentials = Effect.succeed({
  access_token: "user",
  refresh_token: "fixture",
  user: { id: account.actor },
});
const client = mealClient("https://fixture.invalid/", account, credentials);
const result = { version: 1, receipt, envelope: ready };
const run = (effect, fetch) =>
  Effect.runPromise(effect.pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)));

test("native approval binds receipt identities and version while rejecting injected approval data", async () => {
  const command = {
    operationId: id(850),
    proposalId: ready.proposal.proposalId,
    expectedRevision: "2",
  };
  const approved = {
    version: 1,
    actorId: account.actor,
    householdId: account.household,
    operationId: command.operationId,
    proposalId: command.proposalId,
    approvedRevision: "2",
    revision: "3",
    weekStart: ready.proposal.weekStart,
    previousWeekRevision: "0",
    weekRevision: "1",
    entries: [
      {
        proposalEntryId: id(950),
        entryId: id(960),
        date: ready.proposal.weekStart,
        slot: "dinner",
      },
    ],
  };
  assert.deepEqual(
    await run(client.proposals.approve(command), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/proposal/approve");
      assert.deepEqual(JSON.parse(init.body), command);
      return Response.json({ version: 1, receipt: approved });
    }),
    approved,
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(851) },
    { proposalId: id(999) },
    { approvedRevision: "3", revision: "4" },
    { privateContext: "hidden" },
  ])
    await assert.rejects(
      run(client.proposals.approve(command), async () =>
        Response.json({ version: 1, receipt: { ...approved, ...patch } }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(client.proposals.approve({ ...command, approved: true }), async () =>
      assert.fail("Invalid input sent"),
    ),
    { code: "invalid" },
  );
});

test("native proposal client binds actor, operation and current content to the submitted week", async () => {
  assert.deepEqual(
    await run(client.proposals.generate(command), async () => Response.json(result)),
    result,
  );
  for (const patch of [
    { actorId: id(2) },
    { operationId: id(801) },
    { expectedWeekRevision: "1" },
    { familiarOnly: true },
  ])
    await assert.rejects(
      run(client.proposals.reserve(command), async () =>
        Response.json({ version: 1, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(client.proposals.recover(id(999)), async () => Response.json(ready)),
    { code: "unavailable" },
  );
  const other = mealClient("https://fixture.invalid/", { ...account, actor: id(2) }, credentials);
  await assert.rejects(
    run(other.proposals.generate(command), async () => assert.fail("wrong account sent a request")),
    { code: "session" },
  );
});

test("only generation has the longer bounded timeout; ordinary requests still expire after fifteen seconds", async () => {
  let finish;
  const fetch = (url, init) =>
    new Promise((resolve, reject) => {
      if (String(url).includes("/generate")) finish = resolve;
      init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  const program = Effect.gen(function* () {
    const generation = yield* client.proposals.generate(command).pipe(Effect.forkChild);
    const ordinary = yield* client.read(command.weekStart).pipe(Effect.forkChild);
    yield* TestClock.adjust("16 seconds");
    assert.ok(Exit.isFailure(yield* Fiber.await(ordinary)));
    assert.equal(generation.pollUnsafe(), undefined);
    finish(Response.json(result));
    assert.deepEqual(yield* Fiber.join(generation), result);
    const bounded = yield* client.proposals.generate(command).pipe(Effect.forkChild);
    yield* TestClock.adjust("180 seconds");
    assert.ok(Exit.isFailure(yield* Fiber.await(bounded)));
  }).pipe(Effect.provide(TestClock.layer()));
  await run(program, fetch);
});

test("native handoff read binds its original receipt, requested proposal and owner", async () => {
  assert.deepEqual(
    await run(client.proposals.open(receipt.proposalId), async (url, init) => {
      assert.equal(new URL(url).pathname, "/v1/meals/proposal/open");
      assert.deepEqual(JSON.parse(init.body), { proposalId: receipt.proposalId });
      return Response.json(result);
    }),
    result,
  );
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { expectedWeekRevision: "2" },
    { privateContext: "hidden" },
  ])
    await assert.rejects(
      run(client.proposals.open(receipt.proposalId), async () =>
        Response.json({ ...result, receipt: { ...receipt, ...patch } }),
      ),
      { code: "unavailable" },
    );
  await assert.rejects(
    run(client.proposals.open(id(999)), async () => Response.json(result)),
    { code: "unavailable" },
  );
  await assert.rejects(
    run(client.proposals.open("bad"), async () => assert.fail("Invalid link sent")),
    { code: "invalid" },
  );
});
