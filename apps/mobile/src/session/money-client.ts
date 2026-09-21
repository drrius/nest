import type { RefundDecision } from "../money/refund-approval-client";
import type { RefundSave } from "../money/refund-client";
import type { SettlementDecision } from "../money/settlement-approval-client";
import type { SettlementSave } from "../money/settlement-client";
import type { ExpenseSave } from "../money/expense-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { moneyClient } from "../money/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
import type { ExpenseDecision } from "../money/approval-client";
export function sessionMoney(auth: SupabaseClient["auth"], account: Account, apiUrl: string) {
  const client = moneyClient(apiUrl, account, sessionCredentials(auth));
  return {
    refundApproval: (approvalId: string) =>
      client.refundApproval(approvalId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    decideRefund: (input: RefundDecision) =>
      client.decideRefund(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverRefund: (input: RefundSave) =>
      client.recoverRefund(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancelRefund: (input: RefundSave) =>
      client.cancelRefund(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    refundContext: (sourceEventId: string) =>
      client.refundContext(sourceEventId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    saveRefund: (input: RefundSave) =>
      client.saveRefund(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    settlementApproval: (approvalId: string) =>
      client
        .settlementApproval(approvalId)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    decideSettlement: (input: SettlementDecision) =>
      client.decideSettlement(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverSettlement: (input: SettlementSave) =>
      client.recoverSettlement(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancelSettlement: (input: SettlementSave) =>
      client.cancelSettlement(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    saveSettlement: (input: SettlementSave) =>
      client.saveSettlement(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancelExpense: (input: ExpenseSave) =>
      client.cancelExpense(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverExpense: (input: ExpenseSave) =>
      client.recoverExpense(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    saveExpense: (input: ExpenseSave) =>
      client.saveExpense(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    categories: (after: string | null = null) =>
      client.categories(after).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    category: (categoryId: string) =>
      client.category(categoryId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    approval: (approvalId: string) =>
      client.approval(approvalId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    decideExpense: (input: ExpenseDecision) =>
      client.decideExpense(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    balance: () => client.balance().pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    history: (before: string | null = null) =>
      client.history(before).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    detail: (eventId: string) =>
      client.detail(eventId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
