import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReceiptUploadInput } from "@nest/contracts/receipt-upload";
export type ReceiptKind = "photo" | "pdf";
export interface ReceiptFile {
  bytes: Uint8Array;
  contentType: "image/jpeg" | "application/pdf";
}
export interface SelectedReceipt {
  input: ReceiptUploadInput;
  bytes: Uint8Array;
}
export class ReceiptSelectionFailure extends Schema.TaggedError<ReceiptSelectionFailure>()(
  "ReceiptSelectionFailure",
  { reason: Schema.Literals(["unsupported", "too_large", "unavailable"]) },
) {}
export function receiptDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw new ReceiptSelectionFailure({ reason: "unsupported" });
  const scale = Math.min(1, 2000 / Math.max(width, height));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}
export function checkedReceiptBytes(
  bytes: Uint8Array,
  contentType: ReceiptFile["contentType"],
): ReceiptFile {
  if (bytes.byteLength > 4194304) throw new ReceiptSelectionFailure({ reason: "too_large" });
  const prefix = contentType === "application/pdf" ? [37, 80, 68, 70, 45] : [255, 216, 255];
  if (bytes.byteLength < 12 || !prefix.every((byte, index) => bytes[index] === byte))
    throw new ReceiptSelectionFailure({ reason: "unsupported" });
  return { bytes: new Uint8Array(bytes), contentType };
}
export interface ReceiptSelectionDevice {
  pick: (kind: ReceiptKind) => Promise<ReceiptFile | null>;
  digest: (bytes: Uint8Array) => Promise<string>;
  id: () => string;
}
export function receiptSelection(device: ReceiptSelectionDevice) {
  return (kind: ReceiptKind) =>
    Effect.tryPromise({
      try: async () => {
        const picked = await device.pick(kind);
        if (!picked) return null;
        const file = checkedReceiptBytes(picked.bytes, picked.contentType);
        if ((kind === "pdf") !== (file.contentType === "application/pdf"))
          throw new ReceiptSelectionFailure({ reason: "unsupported" });
        const input = Schema.decodeUnknownSync(ReceiptUploadInput)({
          uploadId: device.id(),
          sha256: await device.digest(file.bytes),
          bytes: file.bytes.length,
          contentType: file.contentType,
        });
        return { input, bytes: file.bytes } satisfies SelectedReceipt;
      },
      catch: (error) =>
        Schema.is(ReceiptSelectionFailure)(error)
          ? error
          : new ReceiptSelectionFailure({ reason: "unavailable" }),
    });
}
