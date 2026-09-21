import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readMoneyDetail } from "../../apps/api/src/money/detail.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" },
  caller = { member: { userId: id(1), householdId: id(10), displayName: "A" }, token: "fixture" };
const good = {
  version: 1,
  householdId: id(10),
  event: {
    eventId: id(100),
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
    hasReceipt: true,
  },
  note: "Household note",
  category: { id: id(70), name: "Food" },
  reversedById: null,
  shares: [
    { memberId: id(1), allocatedCentimes: "51", deltaCentimes: "50" },
    { memberId: id(2), allocatedCentimes: "50", deltaCentimes: "-50" },
  ],
};
const run = (value, input = { eventId: id(100) }) =>
  Effect.runPromise(
    readMoneyDetail(config, caller, input).pipe(
      Effect.provideService(FetchHttpClient.Fetch, async () => Response.json(value)),
    ),
  );
test("financial detail rejects identity injection, incomplete pairs and inconsistent allocations/deltas", async () => {
  assert.deepEqual(await run(good), good);
  for (const input of [{}, { eventId: "bad" }, { eventId: id(100), householdId: id(20) }])
    await assert.rejects(run(good, input), { code: "invalid_request" });
  for (const value of [
    { ...good, householdId: id(20) },
    { ...good, event: { ...good.event, eventId: id(101) } },
    { ...good, receiptPath: "private" },
    { ...good, reversedById: id(100) },
    { ...good, shares: [good.shares[0]] },
    { ...good, shares: [good.shares[0], good.shares[0]] },
    { ...good, shares: [{ ...good.shares[0], deltaCentimes: "51" }, good.shares[1]] },
    { ...good, shares: [{ ...good.shares[0], allocatedCentimes: "50" }, good.shares[1]] },
    { ...good, event: { ...good.event, kind: "refund", relatedEventId: id(99) } },
    { ...good, event: { ...good.event, kind: "settlement" } },
    { ...good, event: { ...good.event, createdBy: id(3) } },
    { ...good, event: { ...good.event, payerId: id(3) } },
    { ...good, event: { ...good.event, kind: "replacement", relatedEventId: id(100) } },
  ])
    await assert.rejects(run(value), { code: "unavailable" });
});
test("exact expense/refund allocation vectors preserve safe centimes without floating point", async () => {
  for (let n = 0; n < 120; n++) {
    const amount = n % 7 === 0 ? 9007199254740991n : BigInt(n * 101),
      own = amount / 3n,
      other = amount - own;
    const kind = n % 2 ? "expense" : "refund",
      sign = kind === "refund" ? -1n : 1n;
    const value = {
      ...good,
      event: {
        ...good.event,
        kind,
        amountCentimes: `${amount}`,
        relatedEventId: kind === "refund" ? id(99) : null,
      },
      shares: [
        { memberId: id(1), allocatedCentimes: `${own}`, deltaCentimes: `${sign * other}` },
        { memberId: id(2), allocatedCentimes: `${other}`, deltaCentimes: `${-sign * other}` },
      ],
    };
    assert.deepEqual(await run(value), value);
  }
});
