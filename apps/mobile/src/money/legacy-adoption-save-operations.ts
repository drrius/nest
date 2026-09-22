import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { LegacyAdoptionSaveAttempt } from "./legacy-adoption-save-attempt.ts";
export function legacyAdoptionSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readLegacyAdoptionSave(account.session),
    stage: (attempt: LegacyAdoptionSaveAttempt, current: () => boolean) =>
      account.store.stageLegacyAdoptionSave(account.session, attempt, current),
    clear: (attempt: LegacyAdoptionSaveAttempt) =>
      account.store.clearLegacyAdoptionSave(account.session, attempt),
    read: (attempt: LegacyAdoptionSaveAttempt) =>
      checked(client.recoverLegacyAdoption(attempt.command)),
    send: (attempt: LegacyAdoptionSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelLegacyAdoption(attempt.command))
        : checked(client.saveLegacyAdoption(attempt.command)).pipe(
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
export type LegacyAdoptionSaveOperations = ReturnType<typeof legacyAdoptionSaveOperations>;
