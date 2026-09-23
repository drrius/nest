import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  DatedReminderSettings,
  canonicalDatedReminderSettings,
} from "../../packages/contracts/src/dated-reminders.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const id = "00000000-0000-4000-8000-000000000001";
const value = { enabled: true, recipientIds: [id], localDate: "2028-02-29", localTime: "09:00" };
test("explicit reminder dates reject nonexistent dates, ambiguous timing and recipient overrides", () => {
  const decode = (input) =>
    Schema.decodeUnknownSync(DatedReminderSettings)(input, { onExcessProperty: "error" });
  assert.deepEqual(decode(value), value);
  for (const patch of [
    { localDate: "2027-02-29" },
    { localTime: "24:00" },
    { recipientIds: [] },
    { recipientIds: [id, id] },
    { overrideMute: true },
    { daysBefore: 1 },
  ])
    assert.throws(() => decode({ ...value, ...patch }));
  assert.deepEqual(canonicalDatedReminderSettings(value), value);
});
