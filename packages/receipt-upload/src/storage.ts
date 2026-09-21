import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import type { ReceiptUploadReservation } from "@nest/contracts/receipt-upload";
import type { UploadCaller } from "./identity.ts";
import { receiptRequest, responseFailure, type UploadConfig } from "./http.ts";
import { readReceiptBytes, ReceiptUploadFailure } from "./bytes.ts";
export const receiptDigest = (bytes: Uint8Array) =>
  Effect.tryPromise({
    try: () =>
      crypto.subtle
        .digest("SHA-256", new Uint8Array(bytes))
        .then((value) =>
          Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join(""),
        ),
    catch: () => new ReceiptUploadFailure({ code: "unavailable" }),
  });
export function uploadObject(
  config: UploadConfig,
  reservation: ReceiptUploadReservation,
  bytes: Uint8Array,
) {
  return Effect.gen(function* () {
    const credential = Redacted.value(config.credential);
    const response = yield* receiptRequest(
      config,
      credential,
      `storage/v1/object/household-files/${reservation.path}`,
      {
        method: "POST",
        headers: {
          apikey: credential,
          "content-type": reservation.contentType,
          "x-upsert": "false",
        },
        body: new Uint8Array(bytes),
      },
    );
    if (!response.ok) return yield* responseFailure(response);
    yield* Effect.tryPromise({
      try: () => response.body?.cancel() ?? Promise.resolve(),
      catch: () => new ReceiptUploadFailure({ code: "unavailable" }),
    });
  });
}
export function verifyStoredObject(
  config: UploadConfig,
  caller: UploadCaller,
  reservation: ReceiptUploadReservation,
) {
  return Effect.gen(function* () {
    const response = yield* receiptRequest(
      config,
      caller.token,
      `storage/v1/object/authenticated/household-files/${reservation.path}`,
    );
    if (!response.ok) return yield* responseFailure(response);
    if (response.headers.get("content-type")?.split(";")[0]?.trim() !== reservation.contentType) {
      void response.body?.cancel().catch(() => {});
      return yield* new ReceiptUploadFailure({ code: "conflict" });
    }
    const bytes = yield* readReceiptBytes(response.body);
    if (bytes.length !== reservation.bytes || (yield* receiptDigest(bytes)) !== reservation.sha256)
      return yield* new ReceiptUploadFailure({ code: "conflict" });
  });
}
