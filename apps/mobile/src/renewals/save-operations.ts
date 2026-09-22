import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { RenewalClient } from "./client.ts";
import type { RenewalSaveAttempt } from "./save-attempt.ts";
export function renewalSaveOperations(account: OfflineAccount, client: RenewalClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readRenewalSave(account.session),
    stage: (attempt: RenewalSaveAttempt, current: () => boolean) =>
      account.store.stageRenewalSave(account.session, attempt, current),
    clear: (attempt: RenewalSaveAttempt) =>
      account.store.clearRenewalSave(account.session, attempt),
    read: (attempt: RenewalSaveAttempt) => checked(client.recover(attempt.command)),
    send: (attempt: RenewalSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancel(attempt.command))
        : checked(
            "fields" in attempt.command
              ? client.save(attempt.command)
              : client.remove(attempt.command),
          ).pipe(
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
export type RenewalSaveOperations = ReturnType<typeof renewalSaveOperations>;
