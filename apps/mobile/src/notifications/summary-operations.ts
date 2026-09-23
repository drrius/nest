import * as Effect from "effect/Effect";
import type { DailySummarySnapshot } from "@nest/contracts/daily-summary";
import type { OfflineAccount } from "../offline/owner.ts";
import type { NotificationClient } from "./client.ts";
export type SummaryReadTarget = string;
export type SummaryReadEntry = typeof DailySummarySnapshot.Type;
export function summaryReadOperations(account: OfflineAccount, client: NotificationClient) {
  return {
    read: (summaryId: string) =>
      Effect.gen(function* () {
        yield* account.store.checkSession(account.session);
        const result = yield* client.summary({ summaryId });
        yield* account.store.checkSession(account.session);
        return result;
      }),
  };
}
export type SummaryReadOperations = ReturnType<typeof summaryReadOperations>;
