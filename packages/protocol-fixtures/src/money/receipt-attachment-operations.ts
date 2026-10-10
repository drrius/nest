import type { ReceiptUploadInput } from "@nest/contracts/receipt-upload";
import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { ReceiptKind, SelectedReceipt, ReceiptSelectionFailure } from "./receipt-selection.ts";
export function receiptAttachmentOperations(
  account: OfflineAccount,
  client: MoneyClient,
  select: (kind: ReceiptKind) => Effect.Effect<SelectedReceipt | null, ReceiptSelectionFailure>,
) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    cleanup: (input: ReceiptUploadInput) => checked(client.cleanupReceipt(input)),
    select: (kind: ReceiptKind) => checked(select(kind)),
    upload: (file: SelectedReceipt) => checked(client.uploadReceipt(file.input, file.bytes)),
  };
}
export type ReceiptAttachmentOperations = ReturnType<typeof receiptAttachmentOperations>;
