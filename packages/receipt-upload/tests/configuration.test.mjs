import assert from "node:assert/strict";
import { test } from "node:test";
import { receiptPublishableKey } from "../../../supabase/functions/nest-receipt-upload/configuration.ts";

test("Edge publishable configuration uses the explicit override or named default only", () => {
  assert.equal(
    receiptPublishableKey(undefined, '{"default":"sb_publishable_test"}'),
    "sb_publishable_test",
  );
  assert.equal(receiptPublishableKey("sb_publishable_override", "bad"), "sb_publishable_override");
  assert.equal(receiptPublishableKey("invalid", '{"default":"sb_publishable_test"}'), undefined);
  for (const input of ["null", "[]", "bad", '{"default":42}', '{"default":"sb_secret_test"}']) {
    assert.equal(receiptPublishableKey(undefined, input), undefined);
  }
});
