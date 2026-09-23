import test from "node:test";
import assert from "node:assert/strict";
import * as Effect from "../../apps/api/node_modules/effect/dist/Effect.js";
import { ApiFailure } from "../../apps/api/src/errors.ts";
import { runPushReceipts } from "../../apps/api/src/push/receipt-sweep.ts";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const claims = [1, 2, 3].map((n) => ({
  version: 1,
  deliveryId: id(n),
  attemptId: id(n),
  ticketId: `ticket-${n}`,
}));
test("receipt sweep isolates failures and missing results without exposing tickets", async () => {
  const result = await Effect.runPromise(
    runPushReceipts(() => Effect.succeed({ scanned: 3, claims }), {
      receipt: (claim) =>
        claim.ticketId === "ticket-1"
          ? Effect.fail(new ApiFailure({ code: "unavailable" }))
          : Effect.succeed(claim.ticketId === "ticket-2" ? "pending" : "recorded"),
    }),
  );
  assert.deepEqual(
    result.outcomes.map((v) => v.status),
    ["failed", "pending", "recorded"],
  );
  assert.ok(!JSON.stringify(result).includes("ticket"));
});
test("duplicate or oversized receipt claims cannot dispatch reads", async () => {
  const worker = { receipt: () => assert.fail("invalid claim dispatch") };
  for (const page of [
    { scanned: 2, claims: [claims[0], claims[0]] },
    { scanned: 0, claims: [claims[0]] },
    { scanned: 101, claims: [] },
    { scanned: 2, claims: [claims[0], { ...claims[1], ticketId: claims[0].ticketId }] },
  ])
    await assert.rejects(Effect.runPromise(runPushReceipts(() => Effect.succeed(page), worker)));
});
