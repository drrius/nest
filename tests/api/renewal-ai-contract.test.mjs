import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  CreateRenewalInput,
  EditRenewalInput,
  RemoveRenewalInput,
} from "../../packages/contracts/src/renewals.ts";
const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const Schema = require("effect/Schema");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const fields = {
  title: "Internet",
  renewalOn: "2028-03-01",
  noticeDays: 1,
  responsibleId: null,
  recurringRuleId: null,
};
const decode = (schema, input) =>
  Schema.decodeUnknownSync(schema)(input, { onExcessProperty: "error" });
test("renewal AI inputs cannot choose authority or retry identities and edits require exact revisions", () => {
  assert.deepEqual(decode(CreateRenewalInput, { fields }), { fields });
  for (const key of ["operationId", "renewalId", "householdId", "actorId", "approvalId"]) {
    assert.throws(() => decode(CreateRenewalInput, { fields, [key]: id }));
  }
  assert.throws(() => decode(EditRenewalInput, { renewalId: id, expectedRevision: null, fields }));
  assert.throws(() => decode(RemoveRenewalInput, { renewalId: id }));
  assert.deepEqual(
    decode(EditRenewalInput, { renewalId: id, expectedRevision: id, fields }).fields,
    fields,
  );
  assert.throws(() =>
    decode(RemoveRenewalInput, { renewalId: id, expectedRevision: id, cancelContract: true }),
  );
});
