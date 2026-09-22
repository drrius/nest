import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { SaveRenewal, RenewalReceipt } from "../../packages/contracts/src/renewals.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fields = {
  title: "Internet",
  renewalOn: "2028-03-01",
  noticeDays: 1,
  responsibleId: null,
  recurringRuleId: null,
};
const command = { operationId: id(1), renewalId: id(2), expectedRevision: null, fields };
const decode = (value) =>
  Schema.decodeUnknownSync(SaveRenewal)(value, { onExcessProperty: "error" });
test("renewal edits reject payment authority and unrepresentable cancellation dates", () => {
  assert.deepEqual(decode(command), command);
  for (const value of [
    { ...command, approved: true },
    { ...command, fields: { ...fields, amountCentimes: "100" } },
    { ...command, fields: { ...fields, cancelService: true } },
    { ...command, fields: { ...fields, renewalOn: "0001-01-01" } },
    { ...command, fields: { ...fields, title: "   " } },
  ])
    assert.throws(() => decode(value));
});
test("renewal receipts cannot misstate their deadline or removal outcome", () => {
  const receipt = {
    version: 1,
    actorId: id(1),
    householdId: id(10),
    operationId: id(3),
    action: "saved",
    renewal: {
      renewalId: id(2),
      revision: id(4),
      fields,
      cancellationOn: "2028-02-29",
      removed: false,
    },
  };
  assert.equal(Schema.is(RenewalReceipt)(receipt), true);
  assert.equal(
    Schema.is(RenewalReceipt)({
      ...receipt,
      renewal: { ...receipt.renewal, cancellationOn: "2028-02-28" },
    }),
    false,
  );
  assert.equal(Schema.is(RenewalReceipt)({ ...receipt, action: "removed" }), false);
});
