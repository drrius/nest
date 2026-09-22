import type { LegacyDismissalSave } from "../money/legacy-dismissal-client.ts";
import type { LegacyDraftQuery } from "@nest/contracts/legacy-recurring-drafts";
import type { RecurringHistoryQuery } from "@nest/contracts/recurring-history";
import type { ManualCycleApproval } from "../money/recurring-manual-approval-client";
import type { ManualCycleDecision } from "../money/recurring-manual-approval-client";
import type { ManualCycleSave } from "../money/recurring-manual-client";
import type { VariableCycleDecision } from "../money/recurring-variable-approval-client";
import type { VariableCycleSave } from "../money/recurring-variable-client";
import type { RecurringResumeDecision } from "../money/recurring-resume-approval-client";
import type { RecurringResumeSave } from "../money/recurring-resume-client";
import type { RecurringStateDecision } from "../money/recurring-state-approval-client";
import type { RecurringDecision } from "../money/recurring-approval-client";
import type { RecurringStateSave } from "../money/recurring-state-client";
import type { RecurringSave } from "../money/recurring-client";
import type { ReceiptUploadInput } from "@nest/contracts/receipt-upload";
import type { ReceiptStorage } from "../money/receipt-upload-client";
import type { ReceiptTarget } from "@nest/contracts/receipt";
import type { CorrectionDecision } from "../money/correction-approval-client";
import type { CorrectionSave } from "../money/correction-client";
import type { RefundDecision } from "../money/refund-approval-client";
import type { RefundSave } from "../money/refund-client";
import type { SettlementDecision } from "../money/settlement-approval-client";
import type { SettlementSave } from "../money/settlement-client";
import type { ExpenseSave } from "../money/expense-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { fetch } from "expo/fetch";
import { moneyClient, type MoneyClient } from "../money/client";
import type { Account } from "../offline/contracts";
import { sessionCredentials } from "./credentials";
import type { ExpenseDecision } from "../money/approval-client";
export function sessionMoney(
  auth: SupabaseClient["auth"],
  account: Account,
  apiUrl: string,
  storage: ReceiptStorage,
) {
  const client = moneyClient(apiUrl, account, sessionCredentials(auth), storage);
  return {
    ...sessionRecurring(client),
    receiptUploads: (after: string | null = null) =>
      client.receiptUploads(after).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cleanupReceipt: (input: ReceiptUploadInput) =>
      client.cleanupReceipt(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    uploadReceipt: (input: ReceiptUploadInput, bytes: Uint8Array) =>
      client.uploadReceipt(input, bytes).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    receipt: (target: ReceiptTarget) =>
      client.receipt(target).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    receiptLink: (target: ReceiptTarget) =>
      client.receiptLink(target).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    correctionApproval: (approvalId: string) =>
      client
        .correctionApproval(approvalId)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    decideCorrection: (input: CorrectionDecision) =>
      client.decideCorrection(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverCorrection: (input: CorrectionSave) =>
      client.recoverCorrection(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancelCorrection: (input: CorrectionSave) =>
      client.cancelCorrection(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    correctionContext: (sourceEventId: string) =>
      client
        .correctionContext(sourceEventId)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    saveCorrection: (input: CorrectionSave) =>
      client.saveCorrection(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
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

function sessionRecurring(client: MoneyClient) {
  return {
    manualCycleContext: (input: ManualCycleApproval) =>
      client.manualCycleContext(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    manualCycleApproval: (approvalId: string) =>
      client
        .manualCycleApproval(approvalId)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    decideManualCycle: (input: ManualCycleDecision) =>
      client.decideManualCycle(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    saveManualCycle: (input: ManualCycleSave) =>
      client.saveManualCycle(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverManualCycle: (input: ManualCycleSave) =>
      client.recoverManualCycle(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancelManualCycleSave: (input: ManualCycleSave) =>
      client.cancelManualCycleSave(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    saveVariableCycle: (input: VariableCycleSave) =>
      client.saveVariableCycle(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverVariableCycle: (input: VariableCycleSave) =>
      client.recoverVariableCycle(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancelVariableCycleSave: (input: VariableCycleSave) =>
      client
        .cancelVariableCycleSave(input)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    saveRecurringResume: (input: RecurringResumeSave) =>
      client.saveRecurringResume(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverRecurringResume: (input: RecurringResumeSave) =>
      client
        .recoverRecurringResume(input)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancelRecurringResumeSave: (input: RecurringResumeSave) =>
      client
        .cancelRecurringResumeSave(input)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recurringResumeApproval: (approvalId: string) =>
      client
        .recurringResumeApproval(approvalId)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    variableCycleApproval: (approvalId: string) =>
      client
        .variableCycleApproval(approvalId)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    decideVariableCycle: (input: VariableCycleDecision) =>
      client.decideVariableCycle(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    decideRecurringResume: (input: RecurringResumeDecision) =>
      client.decideRecurringResume(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recurringStateApproval: (approvalId: string) =>
      client
        .recurringStateApproval(approvalId)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    decideRecurringState: (input: RecurringStateDecision) =>
      client.decideRecurringState(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    saveRecurringState: (input: RecurringStateSave) =>
      client.saveRecurringState(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverRecurringState: (input: RecurringStateSave) =>
      client.recoverRecurringState(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancelRecurringStateSave: (input: RecurringStateSave) =>
      client
        .cancelRecurringStateSave(input)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverRecurring: (input: RecurringSave) =>
      client.recoverRecurring(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancelRecurringSave: (input: RecurringSave) =>
      client.cancelRecurringSave(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recurringApproval: (approvalId: string) =>
      client
        .recurringApproval(approvalId)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    decideRecurring: (input: RecurringDecision) =>
      client.decideRecurring(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    ...sessionLegacyDismissal(client),
    ...sessionRecurringReads(client),
    saveRecurring: (input: RecurringSave) =>
      client.saveRecurring(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}

function sessionRecurringReads(client: MoneyClient) {
  return {
    legacyDrafts: (input: typeof LegacyDraftQuery.Type) =>
      client.legacyDrafts(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    legacyRecurring: (after: string | null = null) =>
      client.legacyRecurring(after).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recurringHistory: (input: typeof RecurringHistoryQuery.Type) =>
      client.recurringHistory(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recurringRules: (after: string | null = null) =>
      client.recurringRules(after).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recurringRule: (ruleId: string) =>
      client.recurringRule(ruleId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}

function sessionLegacyDismissal(client: MoneyClient) {
  return {
    legacyDraftContext: (draftId: string) =>
      client.legacyDraftContext(draftId).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    saveLegacyDismissal: (input: LegacyDismissalSave) =>
      client.saveLegacyDismissal(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    recoverLegacyDismissal: (input: LegacyDismissalSave) =>
      client
        .recoverLegacyDismissal(input)
        .pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
    cancelLegacyDismissal: (input: LegacyDismissalSave) =>
      client.cancelLegacyDismissal(input).pipe(Effect.provideService(FetchHttpClient.Fetch, fetch)),
  };
}
