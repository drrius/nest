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
    cancelExpense: (input: ExpenseSave) =>
      client.cancelExpense(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverExpense: (input: ExpenseSave) =>
      client.recoverExpense(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    saveExpense: (input: ExpenseSave) =>
      client.saveExpense(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
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
