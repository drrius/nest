import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readMoneyHistory } from "../../apps/api/src/money/history.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
  caller = { member: { userId: id(1), householdId: id(10), displayName: "A" }, token: "fixture" };
const row = (n) => ({
  eventId: id(n),
  kind: "expense",
  occurredOn: "2026-09-21",
  createdAt: "2026-09-21T12:00:00.000001Z",
  occurredOrder: "9760",
  createdOrder: "1790000000000001",
  description: "Food",
  amountCentimes: "101",
  createdBy: id(1),
  payerId: id(1),
  relatedEventId: null,
  hasReceipt: false,
});
const good = { version: 1, householdId: id(10), before: null, next: null, events: [row(100)] };
const run = (value, input = { before: null }) =>
  Effect.runPromise(
    readMoneyHistory(config, caller, input).pipe(
      Effect.provideService(FetchHttpClient.Fetch, async () => Response.json(value)),
    ),
  );
test("history boundary rejects malformed authority, response identity/order and invented cursors", async () => {
  assert.deepEqual(await run(good), good);
  for (const input of [{}, { before: "bad" }, { before: null, householdId: id(20) }])
    await assert.rejects(run(good, input), { code: "invalid_request" });
  for (const value of [
    { ...good, householdId: id(20) },
    { ...good, before: id(99) },
    { ...good, next: id(100) },
    { ...good, events: [row(100), row(100)] },
    { ...good, events: [row(100), row(101)] },
    { ...good, events: [row(100), { ...row(99), occurredOrder: "9761" }] },
    { ...good, events: [{ ...row(100), createdOrder: "1e20" }] },
    ...["2026-02-29", "0000-01-01", "10000-13-01", "infinity\n", "2026-09-21\n"].map(
      (occurredOn) => ({ ...good, events: [{ ...row(100), occurredOn }] }),
    ),
    ...["2026-09-21T24:00:00.000000Z", "2026-02-29T12:00:00.000000Z", "infinity\n"].map(
      (createdAt) => ({ ...good, events: [{ ...row(100), createdAt }] }),
    ),
    { ...good, events: [{ ...row(100), receiptPath: "private" }] },
    { ...good, events: [{ ...row(100), amountCentimes: "-1" }] },
    { ...good, events: [{ ...row(100), kind: "reversal" }] },
    { ...good, events: [{ ...row(100), createdAt: "2026-09-21T12:00:00.001Z" }] },
  ])
    await assert.rejects(run(value), { code: "unavailable" });
  const full = Array.from({ length: 50 }, (_, n) => row(100 - n));
  assert.deepEqual((await run({ ...good, events: full, next: id(51) })).events, full);
});

test("opening successors retain parent links while unrelated and self-linked events remain invalid", async () => {
  const successor = { ...row(100), kind: "opening_balance", relatedEventId: id(90) };
  assert.deepEqual((await run({ ...good, events: [successor] })).events, [successor]);
  for (const event of [
    { ...successor, relatedEventId: id(100) },
    { ...successor, kind: "expense" },
    { ...successor, kind: "settlement" },
    { ...successor, kind: "refund", relatedEventId: null },
  ])
    await assert.rejects(run({ ...good, events: [event] }), { code: "unavailable" });
});
