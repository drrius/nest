import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { LegacyRecurringList } from "../../packages/contracts/src/legacy-recurring.ts";
import { LegacyDraftList } from "../../packages/contracts/src/legacy-recurring-drafts.ts";
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const Schema = await import(require.resolve("effect/Schema"));
const fixture = JSON.parse(
  readFileSync(
    new URL("../../apps/ios/Tests/Core/Fixtures/legacy-recurring-read.json", import.meta.url),
    "utf8",
  ),
);
test("Swift retained rule and draft fixtures match exact Effect read schemas without losing cents or microseconds", () => {
  const options = { onExcessProperty: "error" };
  const rules = Schema.decodeUnknownSync(LegacyRecurringList)(fixture.rules, options);
  const drafts = Schema.decodeUnknownSync(LegacyDraftList)(fixture.drafts, options);
  assert.deepEqual(rules, fixture.rules);
  assert.deepEqual(drafts, fixture.drafts);
  assert.equal(rules.rules[0].mode, "legacy_draft_only");
  assert.equal(drafts.drafts[0].amountCentimes, "9007199254740991");
  assert.equal(drafts.drafts[0].updatedAt.value, "2026-01-01T10:00:00.123456Z");
});

test("retained unsupported value limits use UTF-16 length while raw labels preserve scalar length", () => {
  for (const count of [40, 41]) {
    const page = structuredClone(fixture.rules);
    page.rules[0].nextOccurrenceOn = {
      kind: "unsupported",
      reason: "out_of_range",
      value: "🙂".repeat(count),
    };
    assert.equal(Schema.is(LegacyRecurringList)(page), count === 40);
  }
  const page = structuredClone(fixture.rules);
  page.rules[0].description = "🙂".repeat(200);
  assert.equal(Schema.is(LegacyRecurringList)(page), true);
  page.rules[0].description += "🙂";
  assert.equal(Schema.is(LegacyRecurringList)(page), false);
});
