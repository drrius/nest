import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readPendingFinancialApprovals } from "../../apps/api/src/money/pending-approvals.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Http = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "First" },
  token: "fixture",
};
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const page = {
  version: 1,
  householdId: id(10),
  actorId: id(1),
  approvals: [
    { approvalId: id(100), command: "expenses.record", expiresAt: "2026-09-23T12:00:00.000000Z" },
  ],
  next: null,
};
const run = (value, input = { after: null }) =>
  Effect.runPromise(
    readPendingFinancialApprovals(config, caller, input).pipe(
      Effect.provideService(Http.Fetch, async () => Response.json(value)),
    ),
  );
test("pending approval service rejects substituted actor, household, cursor and private payload", async () => {
  assert.deepEqual(await run(page), page);
  for (const value of [
    { ...page, actorId: id(2) },
    { ...page, householdId: id(11) },
    { ...page, approvals: [{ ...page.approvals[0], payload: { secret: true } }] },
  ])
    await assert.rejects(run(value));
  await assert.rejects(run(page, { after: id(100) }));
  await assert.rejects(run(page, { after: null, actorId: id(2) }));
});
