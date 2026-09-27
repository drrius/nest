import assert from "node:assert/strict";
import test from "node:test";
import { formatAgendaWhen } from "../src/calendar/agenda-when.ts";

test("all-day events show civil dates without midnight times across DST days", () => {
  for (const [start, end, expected] of [
    ["2026-03-29T00:00:00+01:00", "2026-03-30T00:00:00+02:00", "Mar 29, 2026"],
    ["2026-10-25T00:00:00+02:00", "2026-10-26T00:00:00+01:00", "Oct 25, 2026"],
  ]) {
    assert.equal(
      formatAgendaWhen(
        { allDay: true, start: Date.parse(start), end: Date.parse(end) },
        "en-US",
        "Europe/Zurich",
      ),
      `All day · ${expected}`,
    );
  }
});

test("multi-day all-day events show the inclusive last civil day", () => {
  assert.equal(
    formatAgendaWhen(
      {
        allDay: true,
        start: Date.parse("2026-03-29T00:00:00+01:00"),
        end: Date.parse("2026-04-01T00:00:00+02:00"),
      },
      "en-US",
      "Europe/Zurich",
    ),
    "All day · Mar 29, 2026 — Mar 31, 2026",
  );
});

test("timed events retain their start and end times", () => {
  assert.equal(
    formatAgendaWhen(
      {
        allDay: false,
        start: Date.parse("2026-09-27T18:00:00+02:00"),
        end: Date.parse("2026-09-27T19:00:00+02:00"),
      },
      "en-US",
      "Europe/Zurich",
    ),
    "Sep 27, 2026 · 6:00 PM – 7:00 PM",
  );
});

test("timed events crossing a civil day retain both dates", () => {
  assert.equal(
    formatAgendaWhen(
      {
        allDay: false,
        start: Date.parse("2026-09-27T23:30:00+02:00"),
        end: Date.parse("2026-09-28T00:30:00+02:00"),
      },
      "en-US",
      "Europe/Zurich",
    ),
    "Sep 27, 2026, 11:30 PM — Sep 28, 2026, 12:30 AM",
  );
});
