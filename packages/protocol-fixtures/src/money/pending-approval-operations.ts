import * as Effect from "effect/Effect";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MoneyClient } from "./client.ts";
export function pendingApprovalOperations(account: OfflineAccount, client: MoneyClient) {
  return {
    read: (after: string | null) =>
      Effect.gen(function* () {
        yield* account.store.checkSession(account.session);
        const page = yield* client.pendingFinancialApprovals(after);
        yield* account.store.checkSession(account.session);
        return page;
      }),
  };
}
export type PendingApprovalOperations = ReturnType<typeof pendingApprovalOperations>;
