import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { RenewalReminderClient } from "./client.ts";
import type { RenewalReminderSaveAttempt } from "./save-attempt.ts";
export function renewalReminderSaveOperations(
  account: OfflineAccount,
  client: RenewalReminderClient,
) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readRenewalReminderSave(account.session),
    stage: (attempt: RenewalReminderSaveAttempt, current: () => boolean) =>
      account.store.stageRenewalReminderSave(account.session, attempt, current),
    clear: (attempt: RenewalReminderSaveAttempt) =>
      account.store.clearRenewalReminderSave(account.session, attempt),
    read: (attempt: RenewalReminderSaveAttempt) => checked(client.recover(attempt.command)),
    send: (attempt: RenewalReminderSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancel(attempt.command))
        : checked(client.save(attempt.command)).pipe(
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
export type RenewalReminderSaveOperations = ReturnType<typeof renewalReminderSaveOperations>;
