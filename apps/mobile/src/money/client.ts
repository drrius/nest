import { receiptClient } from "./receipt-client.ts";
import { correctionApprovalClient } from "./correction-approval-client.ts";
import { correctionClient } from "./correction-client.ts";
import { refundApprovalClient } from "./refund-approval-client.ts";
import { refundClient } from "./refund-client.ts";
import { settlementApprovalClient } from "./settlement-approval-client.ts";
import { settlementClient } from "./settlement-client.ts";
import { expenseCategoryClient } from "./category-client.ts";
import { expenseClient } from "./expense-client.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MoneyBalance } from "@nest/contracts/money";
import { MoneyHistory, MoneyHistoryQuery } from "@nest/contracts/money-history";
import { MoneyDetail, MoneyDetailQuery } from "@nest/contracts/money-detail";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import { expenseApprovalClient } from "./approval-client.ts";
const invalid = () => new PreferenceFailure({ code: "invalid" });
const unavailable = () => new PreferenceFailure({ code: "unavailable" });
export function moneyClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
  storageOrigin?: string,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = <A extends { householdId: string }>(path: string, schema: Schema.Codec<A>) =>
    request(path, schema).pipe(
      Effect.flatMap((value) =>
        value.householdId === account.household
          ? Effect.succeed(value)
          : Effect.fail(new PreferenceFailure({ code: "forbidden" })),
      ),
    );
  return {
    ...receiptClient(apiUrl, account, credentials, storageOrigin),
    ...correctionApprovalClient(apiUrl, account, credentials),
    ...correctionClient(apiUrl, account, credentials),
    ...expenseApprovalClient(apiUrl, account, credentials),
    ...expenseClient(apiUrl, account, credentials),
    ...refundClient(apiUrl, account, credentials),
    ...refundApprovalClient(apiUrl, account, credentials),
    ...settlementApprovalClient(apiUrl, account, credentials),
    ...settlementClient(apiUrl, account, credentials),
    ...expenseCategoryClient(apiUrl, account, credentials),
    balance: () =>
      scoped("v1/money/balance", MoneyBalance).pipe(
        Effect.flatMap((value) =>
          value.members.some((member) => member.actorId === account.actor)
            ? Effect.succeed(value)
            : Effect.fail(unavailable()),
        ),
      ),
    history: (before: string | null = null) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(MoneyHistoryQuery)({ before }).pipe(
          Effect.mapError(invalid),
        );
        const cursor = query.before?.toLowerCase() ?? null;
        const params = new URLSearchParams();
        if (cursor !== null) params.set("before", cursor);
        const result = yield* scoped(`v1/money/history?${params}`, MoneyHistory);
        if (result.before !== cursor) return yield* unavailable();
        return result;
      }),
    detail: (eventId: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(MoneyDetailQuery)({ eventId }).pipe(
          Effect.mapError(invalid),
        );
        const target = query.eventId.toLowerCase();
        const result = yield* scoped(
          `v1/money/detail?${new URLSearchParams({ eventId: target })}`,
          MoneyDetail,
        );
        if (
          result.event.eventId !== target ||
          !result.shares.some((share) => share.memberId === account.actor)
        )
          return yield* unavailable();
        return result;
      }),
  };
}
export type MoneyClient = ReturnType<typeof moneyClient>;
