import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/mobile/package.json", import.meta.url));
const Effect = await import(require.resolve("effect/Effect"));
import {
  CalendarRenewalRuntime,
  visibleCalendarRenewals,
} from "../../apps/mobile/src/calendar/renewal-runtime.ts";
import { agendaRows } from "../../apps/mobile/src/calendar/agenda-rows.ts";

test("late renewal reads cannot repopulate a hidden or changed day", async () => {
  const pending = [];
  const runtime = new CalendarRenewalRuntime(
    {
      read: (date) =>
        Effect.promise(() => new Promise((resolve) => pending.push({ date, resolve }))),
    },
    "2028-02-29",
  );
  await runtime.setActive(true);
  const first = runtime.setEnabled(true);
  await new Promise((resolve) => setImmediate(resolve));
  const second = runtime.changeDate("2028-03-01");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pending.length, 2);
  pending[0].resolve({ renewals: [{ renewalId: "old" }], next: null });
  pending[1].resolve({ renewals: [{ renewalId: "current" }], next: null });
  await Promise.all([first, second]);
  assert.deepEqual(visibleCalendarRenewals(runtime.getSnapshot(), "2028-03-01"), [
    { renewalId: "current" },
  ]);
  assert.deepEqual(visibleCalendarRenewals(runtime.getSnapshot(), "2028-02-29"), []);
  const third = runtime.refresh();
  await new Promise((resolve) => setImmediate(resolve));
  await runtime.setEnabled(false);
  pending[2].resolve({ renewals: [{ renewalId: "late" }], next: null });
  await third;
  assert.equal(runtime.getSnapshot().rows, null);
  assert.equal(runtime.getSnapshot().busy, false);
  runtime.dispose();
});

test("renewal day rows remain separate from booked personal and busy time", () => {
  const renewal = { renewalId: "renewal" };
  const rows = agendaRows([{ key: "event", start: 20 }], [{ start: 10, end: 15 }], [], [renewal]);
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["renewal", "partner", "personal"],
  );
  assert.equal(rows[0].value, renewal);
  assert.equal("start" in rows[0], false);
});

test("same-owner authorization recovery can probe again without exposing denied rows", async () => {
  const { PreferenceFailure } = await import("../../apps/mobile/src/preferences/client.ts");
  let denied = true;
  const runtime = new CalendarRenewalRuntime(
    {
      read: () =>
        denied
          ? Effect.fail(new PreferenceFailure({ code: "forbidden" }))
          : Effect.succeed({ renewals: [{ renewalId: "recovered" }], next: null }),
    },
    "2028-02-29",
  );
  await runtime.setActive(true);
  await runtime.setEnabled(true);
  assert.equal(runtime.getSnapshot().access, false);
  assert.deepEqual(visibleCalendarRenewals(runtime.getSnapshot(), "2028-02-29"), []);
  denied = false;
  await runtime.refresh();
  assert.equal(runtime.getSnapshot().access, true);
  assert.deepEqual(visibleCalendarRenewals(runtime.getSnapshot(), "2028-02-29"), [
    { renewalId: "recovered" },
  ]);
  runtime.dispose();
});
