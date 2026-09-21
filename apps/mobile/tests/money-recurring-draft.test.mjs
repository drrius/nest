import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  initialRecurringDraft,
  editRecurringDraft,
  parseRecurringDraft,
} from "../src/money/recurring-draft.ts";
import { formatChfField } from "../../../packages/domain/src/money/centimes.ts";
const require = createRequire(new URL("../../../packages/domain/package.json", import.meta.url));
const fc = await import(require.resolve("fast-check"));
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const members = [id(1), id(2)];
const context = { today: "2026-09-21", ruleId: id(3), current: null, members };
const base = {
  ...initialRecurringDraft(id(1), context.today),
  description: "Rent",
  mode: "fixed",
  amount: "1.01",
};
function snapshot(configuration, overrides = {}) {
  return {
    ruleId: context.ruleId,
    revision: id(4),
    configuration,
    status: "active",
    authorizedBy: id(1),
    authorizedAt: "2026-09-21T00:00:00.000000Z",
    coveredThrough: null,
    nextDueOn: "2026-10-01",
    ...overrides,
  };
}
test("recurring fixed drafts conserve exact centimes and edit allocations across reordered members", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
      fc.boolean(),
      (amount, other) => {
        const draft = { ...base, payerId: members[other ? 1 : 0], amount: formatChfField(amount) };
        const parsed = parseRecurringDraft(draft, context);
        assert.equal(parsed.ok, true);
        assert.equal(
          parsed.rule.configuration.allocations.reduce(
            (sum, share) => sum + BigInt(share.centimes),
            0n,
          ),
          BigInt(amount),
        );
        const current = snapshot(parsed.rule.configuration),
          editing = { ...context, current, members: [...members].reverse() };
        const next = parseRecurringDraft(editRecurringDraft(editing), editing);
        assert.equal(next.ok, true);
        assert.equal(next.rule.expectedRevision, current.revision);
        for (const share of parsed.rule.configuration.allocations)
          assert.deepEqual(
            next.rule.configuration.allocations.find((row) => row.memberId === share.memberId),
            share,
          );
      },
    ),
    { seed: 20260921, numRuns: 1000 },
  );
});
test("variable mode strips stale fixed amounts and shares; preview retains durable period coverage", () => {
  const variable = parseRecurringDraft(
    { ...base, mode: "variable", amount: "invalid", firstExact: "bad" },
    context,
  );
  assert.equal(variable.ok, true);
  assert.equal(variable.rule.configuration.amountCentimes, null);
  assert.equal(variable.rule.configuration.allocations, null);
  const current = snapshot(variable.rule.configuration, {
    status: "paused",
    coveredThrough: "2026-10-31",
  });
  const changed = parseRecurringDraft(
    { ...base, cadence: "weekly", day: "1" },
    { ...context, current },
  );
  assert.equal(changed.ok, true);
  assert.equal(changed.rule.firstDueOn, "2026-11-02");
  assert.equal(changed.rule.expectedRevision, current.revision);
});
test("recurring preview refuses historical starts, invalid dates/schedules, cancelled and overdue edits", () => {
  for (const patch of [
    { date: "2026-09-20" },
    { date: "2026-02-30" },
    { day: "0" },
    { day: "1e1" },
    { cadence: "weekly", day: "8" },
    { receiptPath: "file" },
    { receiptPending: true },
    { receiptTotal: "2" },
    { payerId: id(90) },
    { amount: "1.001" },
  ])
    assert.equal(parseRecurringDraft({ ...base, ...patch }, context).ok, false);
  const configuration = parseRecurringDraft(base, context).rule.configuration;
  for (const patch of [{ status: "cancelled" }, { nextDueOn: "2026-09-20" }, { ruleId: id(99) }])
    assert.equal(
      parseRecurringDraft(base, { ...context, current: snapshot(configuration, patch) }).ok,
      false,
    );
  assert.equal(parseRecurringDraft(base, { ...context, today: "bad" }).ok, false);
});
