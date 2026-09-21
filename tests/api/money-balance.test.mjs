import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readMoneyBalance } from "../../apps/api/src/money/read.ts";
import { MoneyBalance, SignedCentimes } from "../../packages/contracts/src/money.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
const Schema = await import(require.resolve("effect/Schema"));
const FetchHttpClient = await import(require.resolve("effect/unstable/http/FetchHttpClient"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const config = { url: "http://localhost/", publishableKey: "sb_publishable_fixture" };
const caller = {
  member: { userId: id(1), householdId: id(10), displayName: "A" },
  token: "fixture",
};
const good = {
  version: 1,
  householdId: id(10),
  eventCount: "1",
  openingEstablished: true,
  members: [
    { actorId: id(1), displayName: "A", centimes: "101" },
    { actorId: id(2), displayName: "B", centimes: "-101" },
  ],
};
const run = (value) =>
  Effect.runPromise(
    readMoneyBalance(config, caller).pipe(
      Effect.provideService(FetchHttpClient.Fetch, async () => Response.json(value)),
    ),
  );
test("Money contract rejects unsafe, inexact and noncanonical centimes without rounding", () => {
  for (const value of [
    "",
    "abc",
    "1.0",
    "-0",
    "01",
    " 1",
    "9007199254740992",
    "-9007199254740992",
    1,
    null,
  ])
    assert.equal(Schema.is(SignedCentimes)(value), false);
  for (const value of ["0", "1", "-1", "9007199254740991", "-9007199254740991"])
    assert.equal(Schema.is(SignedCentimes)(value), true);
  for (let n = 0; n < 1000; n++) {
    const value = BigInt(n) * 9007199254740n;
    assert.equal(BigInt(Schema.decodeUnknownSync(SignedCentimes)(String(value))), value);
  }
});
test("Money read validates exact household, caller, two unique members and zero sum", async () => {
  assert.deepEqual(await run(good), good);
  for (const value of [
    { ...good, householdId: id(20) },
    { ...good, members: [good.members[1], { ...good.members[0], actorId: id(3) }] },
    { ...good, members: [good.members[0], { ...good.members[1], actorId: id(1) }] },
    { ...good, members: [good.members[0], { ...good.members[1], centimes: "0" }] },
    { ...good, eventCount: "0" },
    { ...good, secret: "unexpected" },
    {
      ...good,
      members: good.members.map((row, n) => ({
        ...row,
        centimes: n ? "-9007199254740992" : "9007199254740992",
      })),
    },
  ])
    await assert.rejects(run(value), { code: "unavailable" });
  assert.equal(
    Schema.is(MoneyBalance)({
      ...good,
      eventCount: "0",
      openingEstablished: false,
      members: good.members.map((row) => ({ ...row, centimes: "0" })),
    }),
    true,
  );
});
