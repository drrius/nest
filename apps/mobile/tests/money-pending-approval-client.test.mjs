import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pendingApprovalClient } from "../src/money/pending-approval-client.ts";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Http = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const page = {
  version: 1,
  householdId: id(10),
  actorId: id(1),
  next: null,
  approvals: [
    { approvalId: id(100), command: "expenses.record", expiresAt: "2026-09-23T12:00:00.000000Z" },
  ],
};
const client = pendingApprovalClient(
  "http://localhost/",
  { actor: id(1), household: id(10) },
  Effect.succeed({ user: { id: id(1) }, access_token: "fixture" }),
);
const run = (value, after = null) =>
  Effect.runPromise(
    client
      .pendingFinancialApprovals(after)
      .pipe(Effect.provideService(Http.Fetch, async () => Response.json(value))),
  );
test("native pending approvals reject private payloads and forged ownership or pagination", async () => {
  assert.deepEqual(await run(page), page);
  for (const value of [
    { ...page, actorId: id(2) },
    { ...page, householdId: id(11) },
    { ...page, approvals: [{ ...page.approvals[0], payload: { secret: true } }] },
    { ...page, next: id(100) },
  ])
    await assert.rejects(run(value));
  await assert.rejects(run(page, id(100)));
  await assert.rejects(run(page, id(101)));
  assert.deepEqual(await run(page, id(99)), page);
});
