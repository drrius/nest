import * as Effect from "effect/Effect";
import type { ReceiptTarget } from "@nest/contracts/receipt";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
import { PreferenceFailure } from "../preferences/client.ts";
export interface ReceiptBrowser {
  open: (url: string) => Promise<unknown>;
  close: () => Promise<unknown>;
}
export function receiptViewOperations(
  account: OfflineAccount,
  client: MoneyClient,
  browser: ReceiptBrowser,
) {
  const checked = <A, E>(effect: Effect.Effect<A, E>) =>
    Effect.gen(function* () {
      yield* account.store.checkSession(account.session);
      const result = yield* effect;
      yield* account.store.checkSession(account.session);
      return result;
    });
  return {
    read: (target: ReceiptTarget) => checked(client.receipt(target)),
    link: (target: ReceiptTarget) => checked(client.receiptLink(target)),
    open: (url: string) =>
      checked(
        Effect.tryPromise({
          try: () => browser.open(url),
          catch: () => new PreferenceFailure({ code: "unavailable" }),
        }),
      ),
    close: () => browser.close().catch(() => {}),
  };
}
export type ReceiptViewOperations = ReturnType<typeof receiptViewOperations>;
