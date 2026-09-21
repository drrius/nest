import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
export function refundEntryOptions(
  account: OfflineAccount,
  client: MoneyClient,
  sourceEventId: string,
) {
  return Effect.gen(function* () {
    yield* account.store.checkSession(account.session);
    const balance = yield* client.refundContext(sourceEventId);
    yield* account.store.checkSession(account.session);
    return balance;
  });
}
