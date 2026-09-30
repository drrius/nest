import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  sourceKey,
  type MealIngredient,
  type MealIngredientPage,
  type MealIngredientsReceipt,
} from "@nest/contracts/meal-ingredients";
import { reconcileIngredientChoices, selectedMealIngredients } from "@nest/domain/meal-ingredients";
import { PreferenceFailure } from "../preferences/client.ts";
import { OfflineFailure } from "../offline/contracts.ts";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MealClient } from "./client.ts";
import { IngredientChoice, type IngredientAttempt } from "./ingredient-draft.ts";
import { readIngredientPages } from "./ingredient-pages.ts";

export type IngredientView = {
  attempt: IngredientAttempt | null;
  ingredients: readonly MealIngredient[];
  skipped: MealIngredientPage["skipped"];
  busy: boolean;
  fresh: boolean;
  access: "ready" | "verify";
  notice: string | null;
  receipt: MealIngredientsReceipt | null;
};
export class IngredientRuntime {
  private view: IngredientView = {
    attempt: null,
    ingredients: [],
    skipped: [],
    busy: false,
    fresh: false,
    access: "ready",
    notice: null,
    receipt: null,
  };
  private client: Pick<MealClient, "read" | "ingredients">;
  private account: OfflineAccount;
  private uuid: () => string;
  readonly weekStart: string;
  private disposed = false;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  constructor(
    client: Pick<MealClient, "read" | "ingredients">,
    account: OfflineAccount,
    weekStart: string,
    uuid: () => string,
  ) {
    this.client = client;
    this.account = account;
    this.weekStart = weekStart;
    this.uuid = uuid;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<IngredientView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure | OfflineFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private async perform<A>(action: () => Promise<A>) {
    if (this.disposed || this.view.busy) return;
    this.publish({ busy: true, notice: null });
    try {
      return await action();
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  }
  private failed(error: unknown) {
    if (
      (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code)) ||
      (Schema.is(OfflineFailure)(error) && error.reason === "session_changed")
    ) {
      this.publish({
        access: "verify",
        attempt: null,
        ingredients: [],
        skipped: [],
        receipt: null,
        fresh: false,
        notice: "Verify your account to continue.",
      });
      return;
    }
    this.publish({
      fresh: false,
      notice: this.view.attempt?.pending
        ? "The addition is not confirmed. Retry the saved request to check its outcome."
        : "Could not finish. Your saved choices are kept. Reload to continue.",
    });
  }
  load = () =>
    this.perform(async () => {
      const { store, session } = this.account;
      const prior = await this.run(store.readIngredientAttempt(session, this.weekStart));
      this.publish({ attempt: prior, fresh: false, receipt: null, access: "ready" });
      if (prior?.pending) {
        this.publish({
          notice:
            "An earlier addition needs confirmation. Retry its saved request before changing choices.",
        });
        return;
      }
      const week = await this.run(this.client.read(this.weekStart));
      const page = await this.run(
        readIngredientPages(this.client.ingredients, this.weekStart, week.revision),
      );
      const choices = reconcileIngredientChoices(page.ingredients, prior?.choices ?? []);
      const attempt = await this.run(
        store.saveIngredientDraft(session, {
          draft: { weekStart: this.weekStart, weekRevision: week.revision, choices },
          expectedSequence: prior?.sequence ?? null,
        }),
      );
      this.publish({ attempt, ...page, fresh: true });
    });
  edit = (input: typeof IngredientChoice.Type, sequence = this.view.attempt?.sequence) =>
    this.perform(async () => {
      const current = this.view.attempt;
      if (!this.view.fresh || !current || current.pending || current.sequence !== sequence)
        return false;
      const choice = Schema.decodeUnknownSync(IngredientChoice)(input, {
        onExcessProperty: "error",
      });
      const source = this.view.ingredients.find((row) => sourceKey(row) === sourceKey(choice));
      if (!source || source.groceryItemId) return;
      const choices = current.choices.map((row) =>
        sourceKey(row) === sourceKey(choice) ? choice : row,
      );
      const attempt = await this.run(
        this.account.store.saveIngredientDraft(this.account.session, {
          draft: { weekStart: current.weekStart, weekRevision: current.weekRevision, choices },
          expectedSequence: current.sequence,
        }),
      );
      this.publish({ attempt, receipt: null });
      return true;
    });
  confirm = (sequence: number) =>
    this.perform(async () => {
      const current = this.view.attempt;
      if (!this.view.fresh || !current || current.pending || current.sequence !== sequence) return;
      const selected = selectedMealIngredients(current.choices);
      if (!selected.length) return;
      const attempt = await this.run(
        this.account.store.stageIngredientAddition(this.account.session, {
          expectedSequence: sequence,
          command: {
            operationId: this.uuid(),
            weekStart: this.weekStart,
            expectedRevision: current.weekRevision,
            selected,
          },
        }),
      );
      this.publish({ attempt, fresh: false, receipt: null });
      await this.send(attempt);
    });
  retry = () =>
    this.perform(async () => {
      const attempt = await this.run(
        this.account.store.readIngredientAttempt(this.account.session, this.weekStart),
      );
      this.publish({ attempt, fresh: false, access: "ready" });
      if (attempt?.pending) await this.send(attempt);
    });
  private async send(attempt: IngredientAttempt) {
    const command = attempt.pending;
    if (!command) return;
    let receipt: MealIngredientsReceipt;
    try {
      receipt = await this.run(this.client.ingredients.add(command));
    } catch (error) {
      if (Schema.is(PreferenceFailure)(error) && ["conflict", "invalid"].includes(error.code)) {
        const cleared = await this.run(
          this.account.store.clearIngredientAddition(this.account.session, {
            weekStart: this.weekStart,
            operationId: command.operationId,
          }),
        );
        this.publish({
          attempt: cleared,
          fresh: false,
          notice:
            "The meals changed or the selection could not be added. Reload and review your choices again.",
        });
        return;
      }
      throw error;
    }
    const saved = await this.run(
      this.account.store.recordIngredientAddition(this.account.session, receipt),
    );
    this.publish({
      attempt: saved,
      receipt,
      fresh: false,
      notice: "The selected ingredients are on the grocery list. Reload to review more.",
    });
  }
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.listeners.clear();
  }
}
