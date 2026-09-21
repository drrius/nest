import { MoneyTime } from "./money-time.ts";
import * as Schema from "effect/Schema";
import { ReceiptUploadInput } from "./receipt-upload.ts";
const Uuid = ReceiptUploadInput.fields.uploadId;
export const ReceiptRecoveryQuery = Schema.Struct({ after: Schema.NullOr(Uuid) });
export const ReceiptRecovery = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  uploaderId: Uuid,
  after: Schema.NullOr(Uuid),
  next: Schema.NullOr(Uuid),
  uploads: Schema.Array(
    Schema.Struct({
      ...ReceiptUploadInput.fields,
      path: Schema.String,
      status: Schema.Literals(["pending", "deleting"]),
      stored: Schema.Boolean,
      createdAt: MoneyTime,
    }),
  ).check(Schema.isMaxLength(50)),
}).check(
  Schema.makeFilter((value) => {
    const ordered = value.uploads.every((row, index) => {
      const suffix = row.contentType === "image/jpeg" ? "jpg" : "pdf";
      return (
        row.uploadId > (value.uploads[index - 1]?.uploadId ?? value.after ?? "") &&
        row.path ===
          `${value.householdId.toLowerCase()}/receipts/${row.uploadId.toLowerCase()}.${suffix}`
      );
    });
    return (
      ordered &&
      (value.next === null ||
        (value.uploads.length === 50 && value.next === value.uploads.at(-1)?.uploadId))
    );
  }),
);
export type ReceiptRecovery = typeof ReceiptRecovery.Type;
