import * as Effect from "effect/Effect";
import type { MoneyClient } from "./client.ts";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyCacheEntry, MoneyCacheTarget } from "../offline/money-contract.ts";
export function moneyReadOperations(
  account: OfflineAccount,
  client: MoneyClient,
  now = () => new Date().toISOString(),
) {
  const { store, session } = account;
  return {
    cached: (target: MoneyCacheTarget) => store.readMoney(session, target),
    remote: (target: MoneyCacheTarget) =>
      Effect.gen(function* () {
        yield* store.checkSession(session);
        const entry = yield* fetchEntry(client, target, now);
        yield* store.checkSession(session);
        return entry;
      }),
    save: (entry: MoneyCacheEntry, current: () => boolean) =>
      store.saveMoney(session, entry, current),
    clear: () => store.clearMoney(session),
  };
}
function fetchEntry(
  client: MoneyClient,
  target: MoneyCacheTarget,
  now: () => string,
): Effect.Effect<MoneyCacheEntry, import("../preferences/client.ts").PreferenceFailure> {
  switch (target.kind) {
    case "balance":
      return client
        .balance()
        .pipe(Effect.map((value) => ({ version: 1, kind: "balance", savedAt: now(), value })));
    case "history":
      return client
        .history(target.before)
        .pipe(Effect.map((value) => ({ version: 1, kind: "history", savedAt: now(), value })));
    case "detail":
      return client
        .detail(target.eventId)
        .pipe(Effect.map((value) => ({ version: 1, kind: "detail", savedAt: now(), value })));
  }
}
export type MoneyReadOperations = ReturnType<typeof moneyReadOperations>;
