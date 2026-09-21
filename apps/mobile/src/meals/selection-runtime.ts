import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  PlaceRecipe,
  ReplaceWithRecipe,
  type RecipePlacementReceipt,
  type RecipeReplacementReceipt,
} from "@nest/contracts/recipe-selection";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import type { MealLibraryPage, SavedMealEnvelope } from "@nest/contracts/meal-library";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealClient } from "./client.ts";
import { selectionTarget, type SelectionTarget } from "./selection-target.ts";
export type SelectionClient = Pick<
  MealClient,
  "read" | "library" | "placeRecipe" | "replaceWithRecipe"
>;
export interface SelectionView {
  week: MealWeekSnapshot | null;
  library: MealLibraryPage | null;
  selected: SavedMealEnvelope | null;
  busy: boolean;
  pendingWrite: boolean;
  stage: "ready" | "reload" | "uncertain" | "verify" | "saved";
  notice: string | null;
  receipt: RecipePlacementReceipt | RecipeReplacementReceipt | null;
}
export function selectionDestination(view: SelectionView, target: SelectionTarget) {
  if (!view.week) return false;
  const occupying = view.week.entries.find(
    (entry) => entry.date === target.date && entry.slot === target.slot,
  );
  return target.entryId ? occupying?.entryId === target.entryId : !occupying;
}
export class RecipeSelectionRuntime {
  private view: SelectionView = {
    week: null,
    library: null,
    selected: null,
    busy: false,
    pendingWrite: false,
    stage: "ready",
    notice: null,
    receipt: null,
  };
  private confirmedRevision: string | null = null;
  private attempt: PlaceRecipe | ReplaceWithRecipe | null = null;
  private listeners = new Set<() => void>();
  private lifetime = new AbortController();
  private disposed = false;
  private client: SelectionClient;
  private uuid: () => string;
  readonly target: SelectionTarget;
  constructor(client: SelectionClient, target: SelectionTarget, uuid: () => string) {
    const parsed = selectionTarget(target);
    if (!parsed) throw new Error("Invalid recipe destination");
    this.target = Object.freeze(parsed);
    this.client = client;
    this.uuid = uuid;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<SelectionView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  load = async () => {
    if (this.disposed || this.view.busy || (this.attempt && !this.view.receipt)) return;
    this.publish({ busy: true });
    try {
      const week = await this.run(this.client.read(this.target.weekStart));
      if (this.confirmedRevision !== null) {
        if (BigInt(week.revision) < BigInt(this.confirmedRevision))
          throw new PreferenceFailure({ code: "unavailable" });
        this.publish({
          week,
          stage: "saved",
          notice: "Your recipe was confirmed. The week now shows the current household plan.",
        });
      } else {
        const library = await this.run(this.client.library.read());
        this.publish({ week, library, selected: null, stage: "ready", notice: null });
      }
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  };
  more = async () => {
    const library = this.view.library;
    if (!this.editable() || !library?.nextAfterId) return;
    this.publish({ busy: true });
    try {
      const page = await this.run(this.client.library.read(library.nextAfterId, library.revision));
      this.publish({ library: { ...page, meals: [...library.meals, ...page.meals] } });
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  };
  select = async (definitionId: string) => {
    const library = this.view.library;
    if (!this.editable() || !library?.meals.some((meal) => meal.definitionId === definitionId))
      return;
    this.publish({ busy: true });
    try {
      const selected = await this.run(this.client.library.recipe(definitionId, library.revision));
      if (!selected.recipe) throw new PreferenceFailure({ code: "conflict" });
      this.publish({ selected, notice: null });
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  };
  clear = () => {
    if (this.editable()) this.publish({ selected: null, notice: null });
  };
  private editable() {
    return (
      !this.disposed &&
      !this.view.busy &&
      this.view.stage === "ready" &&
      !this.view.receipt &&
      !this.attempt
    );
  }
  save = async () => {
    const { selected, week } = this.view;
    if (!this.editable() || !selected?.recipe || !week) return;
    if (!selectionDestination(this.view, this.target)) {
      this.publish({
        stage: "reload",
        notice: "This slot changed. Return to the week to choose a destination.",
      });
      return;
    }
    const input = {
      ...this.target,
      operationId: this.uuid(),
      definitionId: selected.recipe.definitionId,
      expectedRevision: week.revision,
      expectedLibraryRevision: selected.revision,
    };
    const parsed = this.target.entryId
      ? Schema.decodeUnknownExit(ReplaceWithRecipe)(input, { onExcessProperty: "error" })
      : Schema.decodeUnknownExit(PlaceRecipe)(input, { onExcessProperty: "error" });
    if (parsed._tag === "Failure") {
      this.publish({
        stage: "reload",
        notice: "This recipe could not be selected. Reload the current week and recipes.",
      });
      return;
    }
    this.attempt = Object.freeze({ ...parsed.value });
    await this.send();
  };
  private async send() {
    if (this.disposed || !this.attempt) return;
    this.publish({ busy: true, pendingWrite: true, notice: null });
    try {
      const command = this.attempt;
      const receipt = await this.run(
        "entryId" in command
          ? this.client.replaceWithRecipe(command)
          : this.client.placeRecipe(command),
      );
      if (this.disposed) return;
      this.attempt = null;
      this.confirmedRevision = receipt.revision;
      this.publish({ receipt, pendingWrite: false, stage: "saved" });
      const week = await this.run(this.client.read(this.target.weekStart));
      if (BigInt(week.revision) < BigInt(receipt.revision))
        throw new PreferenceFailure({ code: "unavailable" });
      this.publish({
        week,
        notice: "Your recipe was confirmed. The week now shows the current household plan.",
      });
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  }
  retry = async () => {
    if (!this.view.busy && this.view.stage === "uncertain") await this.send();
  };
  private failed(error: unknown) {
    if (this.disposed) return;
    const code = Schema.is(PreferenceFailure)(error) ? error.code : "unavailable";
    if (code === "session" || code === "forbidden") {
      this.attempt = null;
      this.publish({
        week: null,
        library: null,
        selected: null,
        receipt: null,
        pendingWrite: false,
        stage: "verify",
        notice: "Verify your account before selecting a recipe.",
      });
    } else if (this.view.stage === "verify") {
      this.publish({ notice: "Your account could not be verified. Try again online." });
    } else if (this.confirmedRevision !== null) {
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "Your recipe was confirmed, but the week could not refresh. Reload; do not add it again.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "The week or recipe changed. This preview is read-only. Reload and select a recipe again.",
      });
    } else this.unavailable();
  }
  private unavailable() {
    this.publish({
      stage: this.attempt ? "uncertain" : "reload",
      notice: this.attempt
        ? "Saving could not be confirmed. Retry this exact selection before making another change."
        : "Could not load current recipes. Connect and reload before selecting.",
    });
  }
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.attempt = null;
    this.listeners.clear();
  }
}
