import type { RecurringHistory } from "@nest/contracts/recurring-history";
import * as Effect from "effect/Effect";
import type { RecurringDetail, RecurringList } from "@nest/contracts/recurring-read";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
export type RecurringReadTarget =
  | { kind: "list"; after: string | null }
  | { kind: "detail"; ruleId: string }
  | { kind: "history"; ruleId: string; before: string | null };
export type RecurringReadEntry =
  | { kind: "list"; value: RecurringList }
  | { kind: "detail"; value: RecurringDetail }
  | { kind: "history"; value: RecurringHistory };
export function recurringReadOperations(account: OfflineAccount, client: MoneyClient) {
  return {
    read: (target: RecurringReadTarget) =>
      Effect.gen(function* () {
        yield* account.store.checkSession(account.session);
        const entry = yield* readTarget(client, target);
        yield* account.store.checkSession(account.session);
        return entry;
      }),
  };
}
export type RecurringReadOperations = ReturnType<typeof recurringReadOperations>;

function readTarget(
  client: MoneyClient,
  target: RecurringReadTarget,
): Effect.Effect<RecurringReadEntry, import("../preferences/client.ts").PreferenceFailure> {
  if (target.kind === "list")
    return client
      .recurringRules(target.after)
      .pipe(Effect.map((value) => ({ kind: "list" as const, value })));
  if (target.kind === "history")
    return client
      .recurringHistory({ ruleId: target.ruleId, before: target.before })
      .pipe(Effect.map((value) => ({ kind: "history" as const, value })));
  return client
    .recurringRule(target.ruleId)
    .pipe(Effect.map((value) => ({ kind: "detail" as const, value })));
}
