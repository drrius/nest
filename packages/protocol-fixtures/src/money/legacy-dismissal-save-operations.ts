import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { LegacyDismissalSaveAttempt } from "./legacy-dismissal-save-attempt.ts";
export function legacyDismissalSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readLegacyDismissalSave(account.session),
    stage: (attempt: LegacyDismissalSaveAttempt, current: () => boolean) =>
      account.store.stageLegacyDismissalSave(account.session, attempt, current),
    clear: (attempt: LegacyDismissalSaveAttempt) =>
      account.store.clearLegacyDismissalSave(account.session, attempt),
    read: (attempt: LegacyDismissalSaveAttempt) =>
      checked(client.recoverLegacyDismissal(attempt.command)),
    send: (attempt: LegacyDismissalSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelLegacyDismissal(attempt.command))
        : checked(client.saveLegacyDismissal(attempt.command)).pipe(
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
export type LegacyDismissalSaveOperations = ReturnType<typeof legacyDismissalSaveOperations>;
