import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { ChoreReminderClient } from "./client.ts";
import type { ChoreReminderSaveAttempt } from "./save-attempt.ts";
export function choreReminderSaveOperations(account: OfflineAccount, client: ChoreReminderClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readChoreReminderSave(account.session),
    stage: (attempt: ChoreReminderSaveAttempt, current: () => boolean) =>
      account.store.stageChoreReminderSave(account.session, attempt, current),
    clear: (attempt: ChoreReminderSaveAttempt) =>
      account.store.clearChoreReminderSave(account.session, attempt),
    read: (attempt: ChoreReminderSaveAttempt) => checked(client.recover(attempt.command)),
    send: (attempt: ChoreReminderSaveAttempt) =>
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
export type ChoreReminderSaveOperations = ReturnType<typeof choreReminderSaveOperations>;
