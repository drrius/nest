import * as Effect from "effect/Effect";
import type { RecurringDetail, RecurringList } from "@nest/contracts/recurring-read";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
export type RecurringReadTarget =
  | { kind: "list"; after: string | null }
  | { kind: "detail"; ruleId: string };
export type RecurringReadEntry =
  | { kind: "list"; value: RecurringList }
  | { kind: "detail"; value: RecurringDetail };
export function recurringReadOperations(account: OfflineAccount, client: MoneyClient) {
  return {
    read: (target: RecurringReadTarget) =>
      Effect.gen(function* () {
        yield* account.store.checkSession(account.session);
        const entry: RecurringReadEntry =
          target.kind === "list"
            ? { kind: "list", value: yield* client.recurringRules(target.after) }
            : { kind: "detail", value: yield* client.recurringRule(target.ruleId) };
        yield* account.store.checkSession(account.session);
        return entry;
      }),
  };
}
export type RecurringReadOperations = ReturnType<typeof recurringReadOperations>;
