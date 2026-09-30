import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReadSavedMeal, type SavedMealEnvelope } from "@nest/contracts/meal-library";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealLibraryClient } from "./library-client.ts";
export const savedMealTarget = (definitionId: unknown, expectedRevision: unknown) => {
  const value = { definitionId, expectedRevision };
  return Schema.is(ReadSavedMeal)(value)
    ? { ...value, definitionId: value.definitionId.toLowerCase() }
    : null;
};
export interface RecipeView {
  snapshot: SavedMealEnvelope | null;
  busy: boolean;
  fresh: boolean;
  access: "ready" | "verify";
  notice: string | null;
}
export class SavedMealRuntime {
  private view: RecipeView = {
    snapshot: null,
    busy: false,
    fresh: false,
    access: "ready",
    notice: null,
  };
  private active: AbortController | null = null;
  private disposed = false;
  private listeners = new Set<() => void>();
  private readonly client: MealLibraryClient;
  private readonly target: typeof ReadSavedMeal.Type;
  constructor(client: MealLibraryClient, target: typeof ReadSavedMeal.Type) {
    this.client = client;
    this.target = target;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(patch: Partial<RecipeView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load(refresh = false) {
    if (this.disposed) return;
    this.active?.abort();
    const attempt = new AbortController();
    this.active = attempt;
    const current = () => !this.disposed && this.active === attempt;
    this.publish({ busy: true, fresh: false, notice: null });
    try {
      const snapshot = await Effect.runPromise(this.readSnapshot(refresh), {
        signal: attempt.signal,
      });
      if (current()) this.publish({ snapshot, fresh: true, access: "ready" });
    } catch (error) {
      if (current()) this.failure(error);
    } finally {
      if (current()) this.publish({ busy: false });
    }
  }
  private readSnapshot(refresh: boolean) {
    const client = this.client,
      target = this.target;
    const previous = this.view.snapshot?.revision ?? target.expectedRevision;
    return Effect.gen(function* () {
      const expected = refresh ? (yield* client.read()).revision : previous;
      return yield* client.recipe(target.definitionId, expected);
    });
  }
  private failure(error: unknown) {
    if (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code))
      this.publish({
        snapshot: null,
        access: "verify",
        notice: "Verify your account before viewing this recipe.",
      });
    else if (Schema.is(PreferenceFailure)(error) && error.code === "conflict")
      this.publish({
        snapshot: null,
        notice: "The recipe library changed. Reload the current recipe.",
      });
    else
      this.publish({
        notice: this.view.snapshot
          ? "Could not refresh. Showing the last loaded recipe; it may have changed."
          : "Could not load this recipe. Connect and try again.",
      });
  }
  cancel() {
    this.active?.abort();
    this.active = null;
    this.publish({ busy: false, fresh: false });
  }
  dispose() {
    this.disposed = true;
    this.active?.abort();
    this.listeners.clear();
  }
}
