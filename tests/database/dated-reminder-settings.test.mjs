import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture, json, id, as } from "./meal-reminder-fixture.mjs";
import { DatedReminderSettings } from "../../packages/contracts/src/dated-reminders.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
test("dated settings SQL agrees with strict contracts and never grants mute override", (t) => {
  const f = fixture(t);
  f.db.file("supabase/migrations/20260923051033_native_dated_reminder_settings.sql");
  const value = {
    enabled: true,
    recipientIds: [id(2), id(1)],
    localDate: "2028-02-29",
    localTime: "02:30",
  };
  const call = (input) => `select private.nest_dated_reminder_settings(${json(input)})`;
  const result = JSON.parse(f.db.sql(call(value)));
  assert.deepEqual(result, { ...value, recipientIds: [id(1), id(2)] });
  assert.equal(Schema.is(DatedReminderSettings)(result), true);
  for (const patch of [
    { localDate: "2027-02-29" },
    { localDate: "2028-02-30" },
    { localDate: "0000-01-01" },
    { localDate: "2028-02-29\n" },
    { localTime: "24:00" },
    { recipientIds: [id(1), id(1)] },
    { recipientIds: [] },
    { overrideMute: true },
    { daysBefore: 0 },
  ])
    assert.throws(() => f.db.sql(call({ ...value, ...patch })));
  assert.throws(() => f.db.sql(as(call(value))), /permission denied/);
  assert.equal(f.db.sql("select count(*) from public.nest_meal_reminders"), "0");
});
