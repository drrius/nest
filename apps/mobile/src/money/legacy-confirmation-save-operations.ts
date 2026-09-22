import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { LegacyConfirmationSaveAttempt } from "./legacy-confirmation-save-attempt.ts";
export function legacyConfirmationSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readLegacyConfirmationSave(account.session),
    stage: (attempt: LegacyConfirmationSaveAttempt, current: () => boolean) =>
      account.store.stageLegacyConfirmationSave(account.session, attempt, current),
    clear: (attempt: LegacyConfirmationSaveAttempt) =>
      account.store.clearLegacyConfirmationSave(account.session, attempt),
    read: (attempt: LegacyConfirmationSaveAttempt) =>
      checked(client.recoverLegacyConfirmation(attempt.command)),
    send: (attempt: LegacyConfirmationSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelLegacyConfirmation(attempt.command))
        : checked(client.saveLegacyConfirmation(attempt.command)).pipe(
            Effect.map((receipt) => ({
              version: 1 as const,
              actorId: receipt.actorId,
              householdId: receipt.householdId,
              operationId: receipt.operationId,
              status: "recorded" as const,
              receipt,
            })),
          ),
  };
}
export type LegacyConfirmationSaveOperations = ReturnType<typeof legacyConfirmationSaveOperations>;
