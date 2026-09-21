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
    readCalendarSelection: (session: Session) =>
      run(() => CalendarSelections.readCalendarSelection(database, session)),
    saveCalendarSelection: (session: Session, selection: CalendarSelection | null) =>
      run(() => CalendarSelections.saveCalendarSelection(database, session, selection)),
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
