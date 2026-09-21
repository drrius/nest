import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
export function correctionEntryOptions(
  account: OfflineAccount,
  client: MoneyClient,
  sourceEventId: string,
) {
  return Effect.gen(function* () {
    yield* account.store.checkSession(account.session);
    const balance = yield* client.correctionContext(sourceEventId);
    yield* account.store.checkSession(account.session);
    return balance;
  });
}
