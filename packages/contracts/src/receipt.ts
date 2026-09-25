import * as Schema from "effect/Schema";
import { SignedCentimes } from "./money.ts";
const Uuid = Schema.String.check(Schema.isUUID());
// Retained legacy references may contain uppercase characters; never rewrite their object keys.
export const RetainedReceiptPath = Schema.String.check(
  Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/receipts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i,
  ),
);
export const ReceiptTarget = Schema.Union([
  Schema.Struct({ eventId: Uuid }),
  Schema.Struct({ receiptPath: RetainedReceiptPath }),
]);
export type ReceiptTarget = typeof ReceiptTarget.Type;
export const ReceiptMetadata = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  target: ReceiptTarget,
  receipt: Schema.NullOr(
    Schema.Struct({
      path: RetainedReceiptPath,
      contentType: Schema.Literals(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
      bytes: Schema.NullOr(SignedCentimes.check(Schema.makeFilter((value) => BigInt(value) >= 0n))),
    }),
  ),
}).check(
  Schema.makeFilter(
    (value) =>
      value.receipt === null ||
      value.receipt.path.split("/")[0]!.toLowerCase() === value.householdId,
  ),
);
export type ReceiptMetadata = typeof ReceiptMetadata.Type;
export const ReceiptLink = Schema.Struct({
  metadata: ReceiptMetadata,
  url: Schema.String,
  expiresAt: Schema.String,
});
export const canonicalReceiptTarget = (target: ReceiptTarget): ReceiptTarget =>
  "eventId" in target ? { eventId: target.eventId.toLowerCase() } : target;

export const ReceiptDeviceHandoff = Schema.Struct({
  kind: Schema.Literal("device_handoff"),
  screen: Schema.Literals(["receipt-uploads", "expense-entry", "grocery-expense"]),
});
