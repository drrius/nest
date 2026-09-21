import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture } from "./recurring-manual-fixture.mjs";
import { ManualCycleReceipt } from "../../packages/contracts/src/recurring-manual.ts";
const require = createRequire(new URL("../../packages/domain/package.json", import.meta.url));
const fc = require("fast-check");
const contracts = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = contracts("effect/Schema");
test("generated fixed and variable manual links never change either member's ledger or duplicate source consumption", (t) => {
  const f = fixture(t);
  let sequence = 10000;
  fc.assert(
    fc.property(
      fc
        .integer({ min: 0, max: 10000000 })
        .chain((amount) =>
          fc.tuple(fc.constant(amount), fc.integer({ min: 0, max: amount }), fc.boolean()),
        ),
      ([amount, own, variable]) => {
        const n = sequence++,
          source = f.source(n + 20000, String(amount), String(own));
        const input = f.setup(n, source, variable ? "variable" : "fixed");
        const before = f.db.sql(
          "select jsonb_agg(to_jsonb(l) order by id) from public.ledger_entries l",
        );
        const result = f.record(f.command(input, n + 30000));
        assert.equal(Schema.is(ManualCycleReceipt)(result), true);
        assert.equal(result.linkedExpense.event.amountCentimes, String(amount));
        assert.equal(
          f.db.sql("select jsonb_agg(to_jsonb(l) order by id) from public.ledger_entries l"),
          before,
        );
        assert.deepEqual(f.record(f.command(input, n + 30000)), result);
        assert.throws(() => f.record(f.command(input, n + 40000)));
      },
    ),
    { numRuns: 25 },
  );
});
