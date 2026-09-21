import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { correctionApiFixture, correction, replacement } from "./correction-api-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { moneyClient } from "../../apps/mobile/src/money/client.ts";
import { id } from "../database/native-expense-helpers.mjs";
import { moneyTools } from "../../apps/api/src/money/tools.ts";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url)),
  Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const run = (effect) => Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch)));
const native = (f, url = f.url) =>
  moneyClient(
    url,
    { actor: id(1), household: id(10) },
    Effect.succeed({ user: { id: id(1) }, access_token: f.bearer }),
  );
test("native correction recovers a lost exact Save without changing the original or duplicating a replacement", async (t) => {
  const f = await correctionApiFixture(t),
    path = "/v1/money/correction/save";
  const proxy = await lostResponseProxy(t, f.url, path),
    client = native(f, proxy.url);
  const before = await run(client.correctionContext(f.source));
  assert.equal(before.canReverse, true);
  assert.equal(before.canReplace, true);
  const command = {
    operationId: id(100),
    correction: correction(f.source.toUpperCase(), { replacement: replacement() }),
  };
  await assert.rejects(run(client.saveCorrection(command)), { code: "unavailable" });
  const receipt = await run(client.saveCorrection(command));
  assert.equal(receipt.correction.sourceEventId, f.source);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "3");
  const after = await run(client.correctionContext(f.source));
  assert.equal(after.canReverse, false);
  assert.equal(after.canReplace, false);
  assert.deepEqual(after.source.event, before.source.event);
  assert.equal(after.source.reversedById, receipt.reversalEventId);
  await assert.rejects(run(client.saveCorrection({ ...command, operationId: id(101) })), {
    code: "conflict",
  });
  assert.equal(
    (await run(client.balance())).members.find((member) => member.actorId === id(1)).centimes,
    "700",
  );
  assert.equal((await f.send(path, { ...command, actorId: id(2) })).status, 400);
  assert.equal((await f.send(path, command, f.otherBearer)).status, 403);
  assert.equal((await f.send(path + "?origin=ui", command)).status, 400);
  assert.equal((await f.send(path, command)).headers.get("cache-control"), "no-store");
  for (const patch of [
    { actorId: id(2) },
    { householdId: id(20) },
    { operationId: id(999) },
    { approvalId: id(200) },
    { correction: { ...receipt.correction, replacement: null }, replacementEventId: null },
  ])
    await assert.rejects(
      Effect.runPromise(
        client
          .saveCorrection(command)
          .pipe(
            Effect.provideService(Fetch.Fetch, async () => Response.json({ ...receipt, ...patch })),
          ),
      ),
      { code: "unavailable" },
    );
});
test("native and AI correction context is strict, authorized and reports active-refund and reversal blockers", async (t) => {
  const f = await correctionApiFixture(t),
    client = native(f);
  const headers = { authorization: `Bearer ${f.bearer}`, "x-nest-household": id(10) };
  const context = await run(client.correctionContext(f.source));
  const tools = moneyTools(new Request(f.url, { headers }), {
    url: f.supabaseUrl,
    publishableKey: "sb_publishable_fixture",
  });
  assert.deepEqual(
    await tools.readCorrectionContext.execute(
      { sourceEventId: f.source },
      { toolCallId: "read-correction", messages: [] },
    ),
    { ok: true, value: context },
  );
  for (const query of [
    "",
    "?sourceEventId=bad",
    `?sourceEventId=${f.source}&sourceEventId=${f.source}`,
    `?sourceEventId=${f.source}&actorId=${id(1)}`,
  ])
    assert.equal(
      (await fetch(f.url + "/v1/money/correction/context" + query, { headers })).status,
      400,
    );
  assert.equal(
    (
      await fetch(f.url + `/v1/money/correction/context?sourceEventId=${f.source}`, {
        headers: { ...headers, authorization: `Bearer ${f.otherBearer}` },
      })
    ).status,
    403,
  );
  for (const value of [
    { ...context, householdId: id(20), source: { ...context.source, householdId: id(20) } },
    {
      ...context,
      source: { ...context.source, event: { ...context.source.event, eventId: id(999) } },
    },
    { ...context, canReplace: false },
  ])
    await assert.rejects(
      Effect.runPromise(
        client
          .correctionContext(f.source)
          .pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value))),
      ),
      { code: "unavailable" },
    );
  const returned = await f.rpc("post_refund", {
    p_related_event_id: f.source,
    p_amount_cents: 300,
    p_allocations: [
      { memberId: id(1), allocatedCents: 100 },
      { memberId: id(2), allocatedCents: 200 },
    ],
    p_occurred_on: "2026-09-21",
    p_idempotency_key: "refund-blocker",
    p_description: "Refund",
    p_note: null,
  });
  const blocked = await run(client.correctionContext(f.source));
  assert.equal(blocked.hasActiveRefunds, true);
  assert.equal(blocked.canReverse, false);
  assert.equal(blocked.canReplace, false);
  const reversed = await run(
    client.saveCorrection({
      operationId: id(300),
      correction: correction(returned.financial_event_id),
    }),
  );
  assert.equal((await run(client.correctionContext(f.source))).canReplace, true);
  const reversal = await run(client.correctionContext(reversed.reversalEventId));
  assert.equal(reversal.canReverse, false);
  assert.equal(reversal.canReplace, false);
});
test("approved correction transport rejects pending and wrong-owner approval; lost consumed result replays exactly", async (t) => {
  const f = await correctionApiFixture(t),
    path = "/v1/money/correction/execute",
    operationId = id(200),
    value = correction(f.source);
  const approvalId = await f.rpc("nest_propose_action", {
    p_household: id(10),
    p_invocation: operationId,
    p_command: "expenses.correct",
    p_version: 1,
    p_payload: value,
  });
  const command = { operationId, correction: value, approvalId };
  assert.equal((await f.send(path, command)).status, 409);
  assert.equal((await f.send(path, { operationId, correction: value })).status, 400);
  await f.rpc("nest_decide_action", {
    p_id: approvalId,
    p_invocation: operationId,
    p_command: "expenses.correct",
    p_version: 1,
    p_payload: value,
    p_approved: true,
  });
  assert.equal((await f.send(path, command, f.partnerBearer)).status, 403);
  const proxy = await lostResponseProxy(t, f.url, path);
  await assert.rejects(f.send(path, command, f.bearer, proxy.url));
  const response = await f.send(path, command, f.bearer, proxy.url);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).approvalId, approvalId);
  assert.equal(f.db.sql("select count(*) from public.financial_events"), "2");
});

test("opening context distinguishes a repairable reversed leaf from an immutable ancestor", async (t) => {
  const f = await correctionApiFixture(t),
    client = native(f);
  const source = f.db.sql(
    `select private.post_financial_event('${id(10)}','${id(1)}','opening_balance','${id(1)}','Opening',100,null,'2026-09-01',null,null,null,null,null,null,null)`,
  );
  const initial = await run(client.correctionContext(source));
  assert.equal(initial.canReverse, true);
  assert.equal(initial.canReplace, true);
  const reversal = await run(
    client.saveCorrection({ operationId: id(400), correction: correction(source) }),
  );
  const leaf = await run(client.correctionContext(source));
  assert.equal(leaf.canReverse, false);
  assert.equal(leaf.canReplace, true);
  assert.equal(leaf.hasOpeningSuccessor, false);
  const replacement = {
    kind: "opening_balance",
    opening: {
      description: "Repaired opening",
      amountCentimes: "200",
      payerId: id(2),
      date: "2026-09-21",
      note: null,
    },
  };
  const repaired = await run(
    client.saveCorrection({
      operationId: id(401),
      correction: correction(source, { expectedReversalId: reversal.reversalEventId, replacement }),
    }),
  );
  const ancestor = await run(client.correctionContext(source));
  assert.equal(ancestor.hasOpeningSuccessor, true);
  assert.equal(ancestor.canReplace, false);
  assert.equal(ancestor.canReverse, false);
  assert.equal((await run(client.correctionContext(repaired.replacementEventId))).canReplace, true);
});
