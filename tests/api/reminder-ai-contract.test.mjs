import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SaveRenewalReminderInput } from "../../packages/contracts/src/reminders.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
test("AI reminder command requires both baselines and rejects operation identity or mute authority", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const input = {
    renewalId: id,
    expectedRenewalRevision: id,
    expectedRevision: null,
    settings: {
      anchor: "renewal",
      delivery: { enabled: true, recipientIds: [id], localTime: "09:00", daysBefore: 1 },
    },
  };
  const decode = (value) =>
    Schema.decodeUnknownSync(SaveRenewalReminderInput)(value, { onExcessProperty: "error" });
  assert.deepEqual(decode(input), input);
  for (const key of ["operationId", "actorId", "householdId", "overrideMute"])
    assert.throws(() => decode({ ...input, [key]: id }));
  for (const key of ["expectedRevision", "expectedRenewalRevision"]) {
    const omitted = { ...input };
    delete omitted[key];
    assert.throws(() => decode(omitted));
  }
  assert.throws(() =>
    decode({
      ...input,
      settings: { ...input.settings, delivery: { ...input.settings.delivery, overrideMute: true } },
    }),
  );
});
