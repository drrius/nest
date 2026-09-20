import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { householdDate } from "../src/calendar.ts";

test("routine dates follow Zurich midnight and DST regardless of the phone timezone", () => {
  for (const [instant, expected] of [
    ["2026-01-01T22:59:59Z", "2026-01-01"],
    ["2026-01-01T23:00:00Z", "2026-01-02"],
    ["2026-07-01T21:59:59Z", "2026-07-01"],
    ["2026-07-01T22:00:00Z", "2026-07-02"],
    ["2026-03-29T00:59:59Z", "2026-03-29"],
    ["2026-03-29T01:00:00Z", "2026-03-29"],
    ["2026-10-25T00:59:59Z", "2026-10-25"],
    ["2026-10-25T01:00:00Z", "2026-10-25"],
  ])
    assert.equal(householdDate(new Date(instant)), expected);
  fc.assert(
    fc.property(
      fc.integer({ min: Date.parse("2020-01-01"), max: Date.parse("2040-01-01") }),
      (time) => {
        const today = Date.parse(householdDate(new Date(time)));
        const later = Date.parse(householdDate(new Date(time + 60000)));
        assert.ok(later === today || later - today === 86400000);
        assert.ok(Math.abs(time - today) < 86400000);
      },
    ),
    { seed: 20260920, numRuns: 1000 },
  );
});
