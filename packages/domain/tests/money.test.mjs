import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import {
  parseChf,
  formatChfField,
  equalAllocation,
  exactAllocation,
  percentageAllocation,
  deriveBalances,
} from "../src/money/index.ts";

const money = fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER });
/** @param {import("fast-check").IProperty<unknown[]>} property */
const check = (property) => fc.assert(property, { seed: 20260919, numRuns: 1000 });

test("CHF parsing is exact across the complete safe integer range", () => {
  check(
    fc.property(money, (cents) => {
      const field = formatChfField(cents);
      assert.equal(parseChf(field), cents);
      assert.equal(parseChf(field.replace(".", ",")), cents);
      assert.equal(parseChf(`${field}1`), null);
    }),
  );
  for (const value of ["", "12.", "-1", "1e3", "NaN", "Infinity", "90071992547409.92", "1,2,3"])
    assert.equal(parseChf(value), null);
  assert.equal(parseChf(" 0.05 "), 5);
});

test("equal splits conserve centimes and assign odd-cent ties to the payer", () => {
  check(
    fc.property(money, (cents) => {
      const [payer, other] = equalAllocation(cents, "A", "B");
      assert.equal(payer.centimes + other.centimes, cents);
      assert.ok(payer.centimes - other.centimes >= 0 && payer.centimes - other.centimes <= 1);
      assert.deepEqual(exactAllocation(cents, ["A", "B"], [other, payer]), [payer, other]);
    }),
  );
});

test("percentages use largest remainders without unsafe intermediate multiplication", () => {
  check(
    fc.property(money, fc.integer({ min: 0, max: 10_000 }), (cents, bps) => {
      const shares = percentageAllocation(cents, "A", "B", bps);
      assert.equal(shares[0].centimes + shares[1].centimes, cents);
      assert.ok(
        shares.every((share) => Number.isSafeInteger(share.centimes) && share.centimes >= 0),
      );
      const error = BigInt(shares[0].centimes) * 10_000n - BigInt(cents) * BigInt(bps);
      assert.ok(error >= -5_000n && error <= 5_000n);
      if (bps === 5000) assert.deepEqual(shares, equalAllocation(cents, "A", "B"));
    }),
  );
  assert.equal(percentageAllocation(1, "A", "B", 1)[1].centimes, 1);
  assert.equal(percentageAllocation(1, "A", "B", 5000)[0].centimes, 1);
});

test("invalid amounts, members, percentages and exact allocations are rejected", () => {
  for (const value of [-1, 0.01, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    assert.throws(() => equalAllocation(value, "A", "B"));
    assert.throws(() => formatChfField(value));
  }
  assert.throws(() => equalAllocation(1, "A", "A"));
  assert.throws(() => percentageAllocation(1, "A", "B", 0.5));
  for (const values of [
    [],
    [{ memberId: "A", centimes: 1 }],
    [
      { memberId: "A", centimes: 1 },
      { memberId: "A", centimes: 0 },
    ],
    [
      { memberId: "A", centimes: 1 },
      { memberId: "B", centimes: 1 },
    ],
  ]) {
    assert.throws(() => exactAllocation(1, ["A", "B"], values));
  }
});

const event = (eventId, cents) => [
  { eventId, memberId: "A", deltaCentimes: cents },
  { eventId, memberId: "B", deltaCentimes: -cents },
];

test("balances derive from zero-sum events, preserving openings and reversals", () => {
  check(
    fc.property(
      fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), { maxLength: 100 }),
      (deltas) => {
        const entries = deltas.flatMap((delta, index) => event(String(index), delta));
        const result = deriveBalances(entries, ["A", "B"]);
        const total = deltas.reduce((sum, delta) => sum + delta, 0);
        assert.equal(result[0].centimes, total);
        assert.equal(result[0].centimes + result[1].centimes, 0);
        assert.deepEqual(deriveBalances([...entries].reverse(), ["A", "B"]), result);
      },
    ),
  );
  assert.equal(
    deriveBalances(
      [...event("opening", 300), ...event("expense", 500), ...event("reversal", -500)],
      ["A", "B"],
    )[0].centimes,
    300,
  );
});

test("ledger validation rejects partial, duplicate, foreign, unbalanced and unsafe entries", () => {
  for (const entries of [
    [event("a", 1)[0]],
    [...event("a", 1), event("a", 1)[0]],
    [{ eventId: "a", memberId: "C", deltaCentimes: 1 }],
    [event("a", 1)[0], event("a", 2)[1]],
    event("a", Number.MAX_SAFE_INTEGER + 1),
  ]) {
    assert.throws(() => deriveBalances(entries, ["A", "B"]));
  }
  assert.throws(() =>
    deriveBalances([...event("a", Number.MAX_SAFE_INTEGER), ...event("b", 1)], ["A", "B"]),
  );
  assert.equal(
    deriveBalances(
      [...event("a", Number.MAX_SAFE_INTEGER), ...event("b", 1), ...event("c", -1)],
      ["A", "B"],
    )[0].centimes,
    Number.MAX_SAFE_INTEGER,
  );
});
