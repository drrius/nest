import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { renewalDeadline } from "../src/renewals.ts";
const day = 86400000;
test("cancellation deadlines preserve civil day distance across leap years and DST seasons", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 731, max: 3652058 }),
      fc.integer({ min: 0, max: 730 }),
      (offset, lead) => {
        const renewal = new Date(Date.parse("0001-01-01T00:00:00Z") + offset * day)
          .toISOString()
          .slice(0, 10);
        const deadline = renewalDeadline(renewal, lead);
        assert.ok(deadline);
        assert.equal((Date.parse(renewal) - Date.parse(deadline)) / day, lead);
        assert.ok(deadline <= renewal);
      },
    ),
    { numRuns: 2000 },
  );
  assert.equal(renewalDeadline("2024-03-01", 1), "2024-02-29");
  assert.equal(renewalDeadline("2025-03-01", 1), "2025-02-28");
  assert.equal(renewalDeadline("0001-01-01", 0), "0001-01-01");
  assert.equal(renewalDeadline("9999-12-31", 0), "9999-12-31");
});
test("invalid and unrepresentable renewal deadlines are refused rather than shifted", () => {
  for (const [date, lead] of [
    ["0001-01-01", 1],
    ["2025-02-29", 0],
    ["2026-01-01", -1],
    ["2026-01-01", 731],
    ["2026-01-01", 0.5],
    ["2026-01-01", NaN],
    ["infinity", 0],
    ["10000-01-01", 0],
  ])
    assert.equal(renewalDeadline(date, lead), null);
});
