import { ReceiptRecoveryQuery, ReceiptRecovery } from "@nest/contracts/receipt-recovery";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ReceiptUploadInput,
  ReceiptUploadCleanup,
  canonicalReceiptUpload,
} from "@nest/contracts/receipt-upload";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export function receiptCleanupClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    receiptUploads: (after: string | null = null) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(ReceiptRecoveryQuery)({ after }).pipe(
          Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
        );
        const cursor = query.after?.toLowerCase() ?? null;
        const params = new URLSearchParams();
        if (cursor) params.set("after", cursor);
        const result = yield* request(`v1/money/receipt/uploads?${params}`, ReceiptRecovery);
        if (
          result.householdId !== account.household ||
          result.uploaderId !== account.actor ||
          result.after !== cursor
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
    cleanupReceipt: (input: ReceiptUploadInput) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(ReceiptUploadInput)(input, {
          onExcessProperty: "error",
        }).pipe(
          Effect.map(canonicalReceiptUpload),
          Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
        );
        const result = yield* request("v1/money/receipt/cleanup", ReceiptUploadCleanup, command);
        const suffix = command.contentType === "image/jpeg" ? "jpg" : "pdf";
        if (
          result.householdId !== account.household ||
          result.uploadId !== command.uploadId ||
          result.path !== `${account.household}/receipts/${command.uploadId}.${suffix}` ||
          result.status === "deleting"
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return result;
      }),
  };
}
