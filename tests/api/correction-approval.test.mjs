import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { correctionApprovals } from "../../apps/api/src/money/correction-approval.ts";
import { id } from "../database/native-expense-helpers.mjs";
import { correction as payload } from "../integration/correction-api-fixture.mjs";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "First" },
  token: "fixture",
};
const pending = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  approval: {
    id: id(100),
    operationId: id(101),
    correction: payload(id(400)),
    status: "pending",
    expiresAt: "2026-09-21T12:00:00.000000Z",
    receipt: null,
  },
};
const receipt = {
  version: 1,
  actorId: id(1),
  householdId: id(10),
  operationId: id(101),
  reversalEventId: id(102),
  replacementEventId: null,
  approvalId: id(100),
  correction: payload(id(400)),
};
const consumed = { ...pending, approval: { ...pending.approval, status: "consumed", receipt } };
const input = {
  approvalId: id(100),
  operationId: id(101),
  correction: payload(id(400)),
  approved: true,
};
const run = (response, action = "read", value = { approvalId: id(100) }) =>
  Effect.runPromise(
    correctionApprovals(config, caller)
      [action](value)
      .pipe(Effect.provideService(FetchHttpClient.Fetch, async () => Response.json(response))),
  );
test("approval response binds owner, exact correction and receipt; a missing committed receipt is never shown as success", async () => {
  assert.deepEqual(await run(pending), pending);
  assert.deepEqual(await run(consumed, "decide", input), consumed);
  for (const response of [
    { ...pending, actorId: id(2) },
    { ...pending, householdId: id(20) },
    { ...pending, approval: { ...pending.approval, id: id(200) } },
    { ...consumed, approval: { ...consumed.approval, receipt: null } },
    {
      ...consumed,
      approval: { ...consumed.approval, receipt: { ...receipt, approvalId: id(200) } },
    },
    {
      ...consumed,
      approval: {
        ...consumed.approval,
        receipt: { ...receipt, correction: payload(id(400), { sourceEventId: id(401) }) },
      },
    },
  ])
    await assert.rejects(run(response), { code: "unavailable" });
  await assert.rejects(run(pending, "decide", input), { code: "unavailable" });
  await assert.rejects(run(consumed, "decide", { ...input, approved: false }), {
    code: "unavailable",
  });
  await assert.rejects(
    run(consumed, "decide", { ...input, correction: payload(id(400), { sourceEventId: id(401) }) }),
    { code: "unavailable" },
  );
  await assert.rejects(run(pending, "read", { approvalId: id(100), actorId: id(2) }), {
    code: "invalid_request",
  });
});
