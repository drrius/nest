import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringSaveAttempt } from "./recurring-save-attempt.ts";
export function recurringSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readRecurringSave(account.session),
    stage: (attempt: RecurringSaveAttempt, current: () => boolean) =>
      account.store.stageRecurringSave(account.session, attempt, current),
    clear: (attempt: RecurringSaveAttempt) =>
      account.store.clearRecurringSave(account.session, attempt),
    read: (attempt: RecurringSaveAttempt) => checked(client.recoverRecurring(attempt.command)),
    send: (attempt: RecurringSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelRecurringSave(attempt.command))
        : checked(client.saveRecurring(attempt.command)).pipe(
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
export type RecurringSaveOperations = ReturnType<typeof recurringSaveOperations>;
