import * as RecurringSaves from "./recurring-saves.ts";
import type { RecurringSaveAttempt } from "../money/recurring-save-attempt.ts";
import * as CorrectionApprovals from "./correction-approvals.ts";
import type { CorrectionApprovalAttempt } from "../money/correction-approval-attempt.ts";
import * as CorrectionSaves from "./correction-saves.ts";
import type { CorrectionSaveAttempt } from "../money/correction-save-attempt.ts";
import * as RefundApprovals from "./refund-approvals.ts";
import type { RefundApprovalAttempt } from "../money/refund-approval-attempt.ts";
import * as RefundSaves from "./refund-saves.ts";
import type { RefundSaveAttempt } from "../money/refund-save-attempt.ts";
import * as SettlementSaves from "./settlement-saves.ts";
import type { SettlementSaveAttempt } from "../money/settlement-save-attempt.ts";
import * as SettlementApprovals from "./settlement-approvals.ts";
import type { SettlementApprovalAttempt } from "../money/settlement-approval-attempt.ts";
import * as ExpenseSaves from "./expense-saves.ts";
import type { ExpenseSaveAttempt } from "../money/save-attempt.ts";
import * as MoneyReads from "./money-reads.ts";
import * as ExpenseApprovals from "./expense-approvals.ts";
import type { ExpenseApprovalAttempt } from "../money/approval-attempt.ts";
import type { MoneyCacheEntry, MoneyCacheTarget } from "./money-contract.ts";
import * as AgendaSelections from "./agenda-selection.ts";
import type { AgendaSelection } from "../calendar/agenda-selection.ts";
import * as MealProposals from "./meal-proposals.ts";
import * as MealIngredients from "./meal-ingredients.ts";
import * as PlannedRecipes from "./planned-recipes.ts";
import type { ReadPlannedRecipe } from "@nest/contracts/recipe-selection";
import * as MealWeeks from "./meal-weeks.ts";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import type { TransferSnapshot } from "./chore-transfers.ts";
import * as CalendarSelections from "./calendar-selection.ts";
import type { CalendarSelection } from "../calendar/selection.ts";
import type { Grocery } from "@nest/contracts/groceries";
import * as Groceries from "./groceries.ts";
import * as GroceryEdit from "./grocery-edit.ts";
import type { GroceryChange } from "../groceries/edit-contract.ts";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { OfflineFailure, type Account, type Item, type Kind, type Session } from "./contracts.ts";
import { initialize, type Database } from "./database.ts";
import type { Chore } from "@nest/contracts/chores";
import * as Chores from "./chores.ts";
import * as Journal from "./journal.ts";
import * as Replay from "./replay.ts";
import * as SessionStore from "./session.ts";

function run<A>(body: () => Promise<A>) {
  return Effect.tryPromise({
    try: body,
    catch: (cause) =>
      Schema.is(OfflineFailure)(cause) ? cause : new OfflineFailure({ reason: "storage" }),
  });
}
export function makeOfflineStore(database: Database) {
  return {
    initialize: run(() => initialize(database)),
    ...recurringSaveStore(database),
    ...settlementApprovalStore(database),
    ...refundApprovalStore(database),
    ...correctionApprovalStore(database),
    ...settlementSaveStore(database),
    ...refundSaveStore(database),
    ...correctionSaveStore(database),
    ...expenseSaveStore(database),
    readExpenseApproval: (session: Session, approvalId: string) =>
      run(() => ExpenseApprovals.readExpenseApproval(database, session, approvalId)),
    stageExpenseApproval: (
      session: Session,
      attempt: ExpenseApprovalAttempt,
      current: () => boolean,
    ) => run(() => ExpenseApprovals.stageExpenseApproval(database, session, attempt, current)),
    clearExpenseApproval: (session: Session, attempt: ExpenseApprovalAttempt) =>
      run(() => ExpenseApprovals.clearExpenseApproval(database, session, attempt)),
    readMoney: (session: Session, target: MoneyCacheTarget) =>
      run(() => MoneyReads.readMoney(database, session, target)),
    saveMoney: (session: Session, entry: MoneyCacheEntry, current: () => boolean) =>
      run(() => MoneyReads.saveMoney(database, session, entry, current)),
    clearMoney: (session: Session) => run(() => MoneyReads.clearMoney(database, session)),
    ...proposalStore(database),
    ...ingredientStore(database),
    readPlannedRecipe: (session: Session, target: ReadPlannedRecipe) =>
      run(() => PlannedRecipes.readPlannedRecipe(database, session, target)),
    savePlannedRecipe: (
      session: Session,
      write: PlannedRecipes.PlannedRecipeCacheWrite,
      current?: () => boolean,
    ) => run(() => PlannedRecipes.savePlannedRecipe(database, session, write, current)),
    readMealWeek: (session: Session, weekStart: string) =>
      run(() => MealWeeks.readMealWeek(database, session, weekStart)),
    saveMealWeek: (session: Session, snapshot: MealWeekSnapshot, current?: () => boolean) =>
      run(() => MealWeeks.saveMealWeek(database, session, snapshot, current)),
    ...calendarStore(database),
    checkSession: (session: Session) =>
      run(() => SessionStore.scoped(database, session, () => Promise.resolve())),
    activate: (account: Account, lease: string) =>
      run(() => SessionStore.activate(database, account, lease)),
    suspend: (session: Session) => run(() => SessionStore.suspend(database, session)),
    enqueue: (session: Session, intent: unknown) =>
      run(() => Journal.enqueue(database, session, intent)),
    read: (session: Session) => run(() => Journal.read(database, session)),
    saveSnapshot: (session: Session, items: readonly Item[]) =>
      run(() => Journal.saveSnapshot(database, session, items)),
    saveGroceries: (session: Session, groceries: readonly Grocery[]) =>
      run(() => Groceries.saveGroceries(database, session, groceries)),
    readGroceries: (session: Session) => run(() => Groceries.readGroceries(database, session)),
    readGroceryChange: (session: Session) =>
      run(() => GroceryEdit.readGroceryChange(database, session)),
    stageGroceryChange: (session: Session, change: GroceryChange) =>
      run(() => GroceryEdit.stageGroceryChange(database, session, change)),
    clearGroceryChange: (session: Session, operation: string) =>
      run(() => GroceryEdit.clearGroceryChange(database, session, operation)),
    saveChores: (
      session: Session,
      chores: readonly Chore[],
      transfers: TransferSnapshot | null = null,
    ) => run(() => Chores.saveChores(database, session, chores, transfers)),
    readChores: (session: Session) => run(() => Chores.readChores(database, session)),
    discardConflict: (session: Session, operation: string) =>
      run(() => Chores.discardConflict(database, session, operation)),
    prepare: (session: Session, kind?: Kind) => run(() => Replay.prepare(database, session, kind)),
    acknowledge: (session: Session, receipt: Replay.Receipt) =>
      run(() => Replay.acknowledge(database, session, receipt)),
    conflict: (
      session: Session,
      operation: string,
      reason: "changed" | "removed" | "access_revoked",
    ) => run(() => Replay.conflict(database, session, operation, reason)),
  };
}
export class OfflineStore extends Context.Service<
  OfflineStore,
  ReturnType<typeof makeOfflineStore>
>()("nest/OfflineStore") {}
export const offlineLayer = (database: Database) =>
  Layer.succeed(OfflineStore, makeOfflineStore(database));

function ingredientStore(database: Database) {
  return {
    readIngredientAttempt: (session: Session, week: string) =>
      run(() => MealIngredients.readIngredientAttempt(database, session, week)),
    saveIngredientDraft: (
      session: Session,
      input: Parameters<typeof MealIngredients.saveIngredientDraft>[2],
    ) => run(() => MealIngredients.saveIngredientDraft(database, session, input)),
    stageIngredientAddition: (
      session: Session,
      input: Parameters<typeof MealIngredients.stageIngredientAddition>[2],
    ) => run(() => MealIngredients.stageIngredientAddition(database, session, input)),
    recordIngredientAddition: (
      session: Session,
      receipt: Parameters<typeof MealIngredients.recordIngredientAddition>[2],
    ) => run(() => MealIngredients.recordIngredientAddition(database, session, receipt)),
    clearIngredientAddition: (
      session: Session,
      target: Parameters<typeof MealIngredients.clearIngredientAddition>[2],
    ) => run(() => MealIngredients.clearIngredientAddition(database, session, target)),
  };
}

function proposalStore(database: Database) {
  return {
    adoptMealProposal: (
      session: Session,
      target: Parameters<typeof MealProposals.adoptMealProposal>[2],
    ) => run(() => MealProposals.adoptMealProposal(database, session, target)),
    stageProposalEdit: (
      session: Session,
      target: Parameters<typeof MealProposals.stageProposalEdit>[2],
    ) => run(() => MealProposals.stageProposalEdit(database, session, target)),
    clearProposalEdit: (
      session: Session,
      target: Parameters<typeof MealProposals.clearProposalEdit>[2],
    ) => run(() => MealProposals.clearProposalEdit(database, session, target)),
    stageProposalApproval: (
      session: Session,
      target: Parameters<typeof MealProposals.stageProposalApproval>[2],
    ) => run(() => MealProposals.stageProposalApproval(database, session, target)),
    clearProposalApproval: (
      session: Session,
      target: Parameters<typeof MealProposals.clearProposalApproval>[2],
    ) => run(() => MealProposals.clearProposalApproval(database, session, target)),
    clearProposalDiscard: (
      session: Session,
      target: Parameters<typeof MealProposals.clearProposalDiscard>[2],
    ) => run(() => MealProposals.clearProposalDiscard(database, session, target)),
    readMealProposalAttempt: (session: Session, week: string) =>
      run(() => MealProposals.readMealProposalAttempt(database, session, week)),
    stageMealProposal: (
      session: Session,
      command: Parameters<typeof MealProposals.stageMealProposal>[2],
    ) => run(() => MealProposals.stageMealProposal(database, session, command)),
    recordMealProposal: (
      session: Session,
      receipt: Parameters<typeof MealProposals.recordMealProposal>[2],
    ) => run(() => MealProposals.recordMealProposal(database, session, receipt)),
    stageProposalDiscard: (
      session: Session,
      target: Parameters<typeof MealProposals.stageProposalDiscard>[2],
    ) => run(() => MealProposals.stageProposalDiscard(database, session, target)),
    clearMealProposalAttempt: (
      session: Session,
      target: Parameters<typeof MealProposals.clearMealProposalAttempt>[2],
    ) => run(() => MealProposals.clearMealProposalAttempt(database, session, target)),
  };
}

function calendarStore(database: Database) {
  return {
    readCalendarSelection: (session: Session) =>
      run(() => CalendarSelections.readCalendarSelection(database, session)),
    saveCalendarSelection: (session: Session, selection: CalendarSelection | null) =>
      run(() => CalendarSelections.saveCalendarSelection(database, session, selection)),
    readAgendaSelection: (session: Session) =>
      run(() => AgendaSelections.readAgendaSelection(database, session)),
    saveAgendaSelection: (session: Session, selection: AgendaSelection | null) =>
      run(() => AgendaSelections.saveAgendaSelection(database, session, selection)),
  };
}

function settlementApprovalStore(database: Database) {
  return {
    readSettlementApproval: (session: Session, approvalId: string) =>
      run(() => SettlementApprovals.readSettlementApproval(database, session, approvalId)),
    stageSettlementApproval: (
      session: Session,
      attempt: SettlementApprovalAttempt,
      current: () => boolean,
    ) =>
      run(() => SettlementApprovals.stageSettlementApproval(database, session, attempt, current)),
    clearSettlementApproval: (session: Session, attempt: SettlementApprovalAttempt) =>
      run(() => SettlementApprovals.clearSettlementApproval(database, session, attempt)),
  };
}

function settlementSaveStore(database: Database) {
  return {
    readSettlementSave: (session: Session) =>
      run(() => SettlementSaves.readSettlementSave(database, session)),
    stageSettlementSave: (
      session: Session,
      attempt: SettlementSaveAttempt,
      current: () => boolean,
    ) => run(() => SettlementSaves.stageSettlementSave(database, session, attempt, current)),
    clearSettlementSave: (session: Session, attempt: SettlementSaveAttempt) =>
      run(() => SettlementSaves.clearSettlementSave(database, session, attempt)),
  };
}

function refundSaveStore(database: Database) {
  return {
    readRefundSave: (session: Session) => run(() => RefundSaves.readRefundSave(database, session)),
    stageRefundSave: (session: Session, attempt: RefundSaveAttempt, current: () => boolean) =>
      run(() => RefundSaves.stageRefundSave(database, session, attempt, current)),
    clearRefundSave: (session: Session, attempt: RefundSaveAttempt) =>
      run(() => RefundSaves.clearRefundSave(database, session, attempt)),
  };
}

function refundApprovalStore(database: Database) {
  return {
    readRefundApproval: (session: Session, approvalId: string) =>
      run(() => RefundApprovals.readRefundApproval(database, session, approvalId)),
    stageRefundApproval: (
      session: Session,
      attempt: RefundApprovalAttempt,
      current: () => boolean,
    ) => run(() => RefundApprovals.stageRefundApproval(database, session, attempt, current)),
    clearRefundApproval: (session: Session, attempt: RefundApprovalAttempt) =>
      run(() => RefundApprovals.clearRefundApproval(database, session, attempt)),
  };
}

function expenseSaveStore(database: Database) {
  return {
    readExpenseSave: (session: Session) =>
      run(() => ExpenseSaves.readExpenseSave(database, session)),
    stageExpenseSave: (session: Session, attempt: ExpenseSaveAttempt, current: () => boolean) =>
      run(() => ExpenseSaves.stageExpenseSave(database, session, attempt, current)),
    clearExpenseSave: (session: Session, attempt: ExpenseSaveAttempt) =>
      run(() => ExpenseSaves.clearExpenseSave(database, session, attempt)),
  };
}

function recurringSaveStore(database: Database) {
  return {
    readRecurringSave: (session: Session) =>
      run(() => RecurringSaves.readRecurringSave(database, session)),
    stageRecurringSave: (session: Session, attempt: RecurringSaveAttempt, current: () => boolean) =>
      run(() => RecurringSaves.stageRecurringSave(database, session, attempt, current)),
    clearRecurringSave: (session: Session, attempt: RecurringSaveAttempt) =>
      run(() => RecurringSaves.clearRecurringSave(database, session, attempt)),
  };
}

function correctionSaveStore(database: Database) {
  return {
    readCorrectionSave: (session: Session) =>
      run(() => CorrectionSaves.readCorrectionSave(database, session)),
    stageCorrectionSave: (
      session: Session,
      attempt: CorrectionSaveAttempt,
      current: () => boolean,
    ) => run(() => CorrectionSaves.stageCorrectionSave(database, session, attempt, current)),
    clearCorrectionSave: (session: Session, attempt: CorrectionSaveAttempt) =>
      run(() => CorrectionSaves.clearCorrectionSave(database, session, attempt)),
  };
}

function correctionApprovalStore(database: Database) {
  return {
    readCorrectionApproval: (session: Session, approvalId: string) =>
      run(() => CorrectionApprovals.readCorrectionApproval(database, session, approvalId)),
    stageCorrectionApproval: (
      session: Session,
      attempt: CorrectionApprovalAttempt,
      current: () => boolean,
    ) =>
      run(() => CorrectionApprovals.stageCorrectionApproval(database, session, attempt, current)),
    clearCorrectionApproval: (session: Session, attempt: CorrectionApprovalAttempt) =>
      run(() => CorrectionApprovals.clearCorrectionApproval(database, session, attempt)),
  };
}
