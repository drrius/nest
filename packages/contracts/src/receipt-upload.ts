import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(Schema.isUUID());
export const ReceiptUploadInput = Schema.Struct({
  uploadId: Uuid,
  sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
  bytes: Schema.Int.check(Schema.isBetween({ minimum: 12, maximum: 4194304 })),
  contentType: Schema.Literals(["image/jpeg", "application/pdf"]),
});
export type ReceiptUploadInput = typeof ReceiptUploadInput.Type;
export const canonicalReceiptUpload = (input: ReceiptUploadInput): ReceiptUploadInput => ({
  ...input,
  uploadId: input.uploadId.toLowerCase(),
});
export const ReceiptUploadReservation = Schema.Struct({
  ...ReceiptUploadInput.fields,
  version: Schema.Literal(1),
  householdId: Uuid,
  uploaderId: Uuid,
  path: Schema.String,
  stored: Schema.Boolean,
}).check(
  Schema.makeFilter(
    (value) =>
      value.path ===
      `${value.householdId.toLowerCase()}/receipts/${value.uploadId.toLowerCase()}.${value.contentType === "image/jpeg" ? "jpg" : "pdf"}`,
  ),
);
export type ReceiptUploadReservation = typeof ReceiptUploadReservation.Type;
