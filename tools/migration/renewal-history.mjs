import assert from "node:assert/strict";
import { renewalConversionSql } from "./renewal-conversion.mjs";
export function verifyHistoricalConversion(db, input, actorId, originalResult) {
  const result = db.sql(`begin;
    update public.household_commitments set title='Changed after conversion'
      where household_id='${input.householdId}' and id='${input.commitmentId}';
    set local role authenticated; set local request.jwt.claim.sub='${actorId}';
    ${renewalConversionSql(input)} rollback;`);
  assert.deepEqual(JSON.parse(result), originalResult);
  const unauthorized = `set role authenticated;
    set request.jwt.claim.sub='00000000-0000-4000-8000-000000000999';
    ${renewalConversionSql(input)}`;
  assert.throws(() => db.sql(unauthorized), /Not authorized/);
  assert.throws(
    () =>
      db.sql(`set role authenticated; set request.jwt.claim.sub='${actorId}';
    ${renewalConversionSql({ ...input, sourceHash: "0".repeat(64) })}`),
    /Renewal changed/,
  );
}
