import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
export function expenseEntryOptions(
  account: OfflineAccount,
  client: MoneyClient,
  after: string | null,
) {
  return Effect.gen(function* () {
    yield* account.store.checkSession(account.session);
    const [balance, categories] = yield* Effect.all([client.balance(), client.categories(after)], {
      concurrency: 2,
    });
    yield* account.store.checkSession(account.session);
    return { members: balance.members, categories };
  });
}
export type ExpenseEntryOptions = Effect.Success<ReturnType<typeof expenseEntryOptions>>;
