import assert from "node:assert/strict";

// Run only against the isolated test API, with synthetic member/outsider credentials.
const origin = process.env.NEST_TEST_API_ORIGIN;
const member = process.env.NEST_TEST_MEMBER_TOKEN;
const outsider = process.env.NEST_TEST_OUTSIDER_TOKEN;
assert.ok(origin && /^https:\/\/nest-test-[a-z0-9-]+\.vercel\.app$/.test(origin));
assert.ok(member && outsider, "Supply synthetic test member and outsider tokens");
const paths = [
  "/v1/session",
  "/v1/meals/week?weekStart=2026-09-21",
  "/v1/latest-daily-summary",
  "/v1/renewals",
  "/v1/calendar/renewals?date=2026-09-27",
  "/v1/money/pending-approvals",
  "/v1/money/recurring/due-variable",
];
for (const path of paths) {
  for (const [token, expected] of [
    [member, 200],
    [outsider, 403],
    [null, 401],
  ]) {
    const response = await fetch(`${origin}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(
      response.status,
      expected,
      `${path}: expected ${expected}, got ${response.status}`,
    );
    const body = await response.json();
    if (expected === 200) assert.equal(body.version, 1);
  }
  console.log(`PASS ${path}: member, outsider, anonymous`);
}
const invalid = await fetch(`${origin}/v1/meals/week?weekStart=2026-09-21&unexpected=1`, {
  headers: { Authorization: `Bearer ${member}` },
  signal: AbortSignal.timeout(30000),
});
assert.equal(invalid.status, 400, "Strict user-query validation must remain intact");
console.log("PASS unknown query field remains rejected");
