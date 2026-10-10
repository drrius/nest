import * as Effect from "effect/Effect";
import type { ReceiptRecovery } from "@nest/contracts/receipt-recovery";
import { OfflineFailure } from "../offline/contracts.ts";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
export type RecoveryRow = ReceiptRecovery["uploads"][number];
export function receiptRecoveryOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const value = yield* effect;
      yield* account.store.checkSession(account.session);
      return value;
    });
  return {
    read: (after: string | null) => checked(client.receiptUploads(after)),
    remove: (row: RecoveryRow) =>
      checked(
        Effect.gen(function* () {
          const pending = yield* account.store.readExpenseSave(account.session);
          if (pending) return yield* new OfflineFailure({ reason: "pending_edit" });
          const { uploadId, sha256, bytes, contentType } = row;
          return yield* client.cleanupReceipt({ uploadId, sha256, bytes, contentType });
        }),
      ),
  };
}
export type ReceiptRecoveryOperations = ReturnType<typeof receiptRecoveryOperations>;
