import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMoneyDay, formatMoneyMoment } from "../src/money/format-date.ts";

test("Money civil dates preserve the day and full retained out-of-range values", () => {
  assert.match(formatMoneyDay("2026-09-27"), /27 Sept 2026/);
  for (const value of ["10000-01-01", "5874897-12-31", "4713-01-01 BC", "infinity", "-infinity"])
    assert.equal(formatMoneyDay(value), `Original date: ${value}`);
});

test("Money instants localize across DST and retain unsupported exact values", () => {
  const zurich = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Europe/Zurich",
  });
  const before = formatMoneyMoment("2026-03-29T00:30:00.000000Z", zurich);
  const after = formatMoneyMoment("2026-03-29T01:30:00.000000Z", zurich);
  assert.match(before, /29 Mar 2026.*1:30/);
  assert.match(after, /29 Mar 2026.*3:30/);
  for (const value of [
    "294276-01-01T00:00:00.000000Z",
    "4713-01-01T00:00:00.000000Z BC",
    "infinity",
    "-infinity",
  ])
    assert.equal(formatMoneyMoment(value), `Original time: ${value}`);
});
