import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SaveRecurringResume } from "@nest/contracts/recurring-resume";
import type { OfflineAccount } from "../offline/owner.ts";
import type { PreferenceFailure } from "../preferences/client.ts";
import type { MoneyClient } from "./client.ts";
import type { RecurringStateSaveAttempt, StateSaveResult } from "./recurring-state-save-attempt.ts";
function read(
  client: MoneyClient,
  { command }: RecurringStateSaveAttempt,
): Effect.Effect<StateSaveResult, PreferenceFailure> {
  return Schema.is(SaveRecurringResume)(command)
    ? client.recoverRecurringResume(command)
    : client.recoverRecurringState(command);
}
function send(
  client: MoneyClient,
  { command, action }: RecurringStateSaveAttempt,
): Effect.Effect<StateSaveResult, PreferenceFailure> {
  if (Schema.is(SaveRecurringResume)(command))
    return action === "cancel"
      ? client.cancelRecurringResumeSave(command)
      : client.saveRecurringResume(command).pipe(Effect.map(recorded));
  return action === "cancel"
    ? client.cancelRecurringStateSave(command)
    : client.saveRecurringState(command).pipe(Effect.map(recorded));
}
function recorded<R extends NonNullable<StateSaveResult["receipt"]>>(receipt: R) {
  return {
    version: 1 as const,
    actorId: receipt.actorId,
    householdId: receipt.householdId,
    operationId: receipt.operationId,
    status: "recorded" as const,
    receipt,
  };
}
export function recurringStateSaveOperations(account: OfflineAccount, client: MoneyClient) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    saved: () => account.store.readRecurringStateSave(account.session),
    stage: (attempt: RecurringStateSaveAttempt, current: () => boolean) =>
      account.store.stageRecurringStateSave(account.session, attempt, current),
    clear: (attempt: RecurringStateSaveAttempt) =>
      account.store.clearRecurringStateSave(account.session, attempt),
    read: (attempt: RecurringStateSaveAttempt) => checked(read(client, attempt)),
    send: (attempt: RecurringStateSaveAttempt) => checked(send(client, attempt)),
  };
}
export type RecurringStateSaveOperations = ReturnType<typeof recurringStateSaveOperations>;
