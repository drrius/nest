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
