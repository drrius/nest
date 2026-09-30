import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
export function settlementEntryOptions(account: OfflineAccount, client: MoneyClient) {
  return Effect.gen(function* () {
    yield* account.store.checkSession(account.session);
    const balance = yield* client.balance();
    yield* account.store.checkSession(account.session);
    return balance;
  });
}
