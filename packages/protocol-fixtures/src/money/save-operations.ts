import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import type { ExpenseSaveAttempt } from "./save-attempt.ts";
export function expenseSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readExpenseSave(account.session),
    stage: (attempt: ExpenseSaveAttempt, current: () => boolean) =>
      account.store.stageExpenseSave(account.session, attempt, current),
    clear: (attempt: ExpenseSaveAttempt) =>
      account.store.clearExpenseSave(account.session, attempt),
    read: (attempt: ExpenseSaveAttempt) => checked(client.recoverExpense(attempt.command)),
    send: (attempt: ExpenseSaveAttempt) =>
      attempt.action === "cancel"
        ? checked(client.cancelExpense(attempt.command))
        : checked(client.saveExpense(attempt.command)).pipe(
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
export type ExpenseSaveOperations = ReturnType<typeof expenseSaveOperations>;
