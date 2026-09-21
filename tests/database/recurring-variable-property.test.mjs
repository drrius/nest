import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fixture, read, id } from "./recurring-variable-fixture.mjs";
import { save } from "./recurring-mandate-fixture.mjs";
import { VariableCycleReceipt } from "../../packages/contracts/src/recurring-variable.ts";
const require = createRequire(new URL("../../packages/domain/package.json", import.meta.url));
const fc = require("fast-check"),
  Schema = createRequire(new URL("../../packages/contracts/package.json", import.meta.url))(
    "effect/Schema",
  );
test("confirmed variable amounts preserve zero-sum centimes and the exact payer debt across generated splits", (t) => {
  const f = fixture(t);
  let sequence = 0;
  const split = fc
    .integer({ min: 1, max: 10000000 })
    .chain((amount) =>
      fc.tuple(fc.constant(amount), fc.integer({ min: 0, max: amount }), fc.boolean()),
    );
  fc.assert(
    fc.property(split, ([amount, share, otherPayer]) => {
      const n = ++sequence,
        ruleId = id(1000 + n),
        payerId = id(otherPayer ? 2 : 1);
      const rule = { ...f.rule, ruleId, configuration: { ...f.rule.configuration, payerId } };
      const saved = read(f.db, save(2000 + n, rule));
      const input = {
        ...f.input,
        ruleId,
        expectedRevision: saved.revision,
        amountCentimes: String(amount),
        allocations: [
          { memberId: id(1), centimes: String(share) },
          { memberId: id(2), centimes: String(amount - share) },
        ],
      };
      const result = read(f.db, f.post(3000 + n, input));
      assert.equal(Schema.is(VariableCycleReceipt)(result), true);
      assert.equal(
        f.db.sql(
          `select sum(receivable_delta_cents) from public.ledger_entries where financial_event_id='${result.eventId}'`,
        ),
        "0",
      );
      assert.equal(
        f.db.sql(
          `select receivable_delta_cents from public.ledger_entries where financial_event_id='${result.eventId}' and member_id='${id(1)}'`,
        ),
        String(otherPayer ? -share : amount - share),
      );
      assert.deepEqual(read(f.db, f.post(3000 + n, input)), result);
    }),
    { numRuns: 30 },
  );
});
