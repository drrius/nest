import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { moneyClient } from "../src/money/client.ts";
const require = createRequire(new URL("../package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect")),
  Fetch = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const account = { actor: id(1), household: id(10) };
const credentials = Effect.succeed({ user: { id: id(1) }, access_token: "fixture" });
const client = moneyClient("http://localhost/", account, credentials);
const balance = {
  version: 1,
  householdId: id(10),
  eventCount: "0",
  openingEstablished: false,
  members: [
    { actorId: id(1), displayName: "A", centimes: "0" },
    { actorId: id(2), displayName: "B", centimes: "0" },
  ],
};
const history = { version: 1, householdId: id(10), before: null, next: null, events: [] };
const row = {
  eventId: id(100),
  kind: "settlement",
  occurredOn: "2026-09-21",
  createdAt: "2026-09-21T12:00:00.000000Z",
  occurredOrder: "9760",
  createdOrder: "1790000000000000",
  description: "Settlement",
  amountCentimes: "50",
  createdBy: id(1),
  payerId: id(1),
  relatedEventId: null,
  hasReceipt: false,
};
const detail = {
  version: 1,
  householdId: id(10),
  event: row,
  note: null,
  category: null,
  reversedById: null,
  shares: [
    { memberId: id(1), allocatedCentimes: null, deltaCentimes: "50" },
    { memberId: id(2), allocatedCentimes: null, deltaCentimes: "-50" },
  ],
};
const run = (effect, value, status = 200) =>
  Effect.runPromise(
    effect.pipe(Effect.provideService(Fetch.Fetch, async () => Response.json(value, { status }))),
  );
test("native Money transport binds credentials, household, cursor and event identities", async () => {
  assert.deepEqual(await run(client.balance(), balance), balance);
  assert.deepEqual(await run(client.history(), history), history);
  assert.deepEqual(await run(client.detail(id(100)), detail), detail);
  for (const { effect, value } of [
    { effect: client.balance(), value: balance },
    { effect: client.history(), value: history },
    { effect: client.detail(id(100)), value: detail },
  ])
    await assert.rejects(run(effect, { ...value, householdId: id(20) }), { code: "forbidden" });
  await assert.rejects(run(client.history(id(100)), history), { code: "unavailable" });
  await assert.rejects(run(client.detail(id(101)), detail), { code: "unavailable" });
  await assert.rejects(
    run(client.balance(), {
      ...balance,
      members: balance.members.map((m) => ({ ...m, actorId: m.actorId === id(1) ? id(3) : id(4) })),
    }),
    { code: "unavailable" },
  );
  const other = moneyClient("http://localhost/", { ...account, actor: id(3) }, credentials);
  await assert.rejects(run(other.balance(), balance), { code: "session" });
});
test("native Money rejects invalid input locally and maps authentication/read failures", async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return Response.json(history);
  };
  for (const effect of [client.history("bad"), client.detail("bad")])
    await assert.rejects(
      Effect.runPromise(effect.pipe(Effect.provideService(Fetch.Fetch, fetch))),
      { code: "invalid" },
    );
  assert.equal(calls, 0);
  for (const [status, code] of [
    [401, "session"],
    [403, "forbidden"],
    [410, "unavailable"],
    [503, "unavailable"],
  ])
    await assert.rejects(run(client.history(), {}, status), { code });
  await assert.rejects(run(client.balance(), { ...balance, receiptPath: "private" }), {
    code: "unavailable",
  });
});
