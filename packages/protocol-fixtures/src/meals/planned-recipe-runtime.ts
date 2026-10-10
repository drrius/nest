import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReadPlannedRecipe, type PlannedRecipeEnvelope } from "@nest/contracts/recipe-selection";
import type { OfflineAccount } from "../offline/owner.ts";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealClient } from "./client.ts";

export interface PlannedRecipeView {
  snapshot: PlannedRecipeEnvelope | null;
  busy: boolean;
  fresh: boolean;
  notice: string | null;
  access: "ready" | "verify";
}
export class PlannedRecipeRuntime {
  private view: PlannedRecipeView = {
    snapshot: null,
    busy: false,
    fresh: false,
    notice: null,
    access: "ready",
  };
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private disposed = false;
  private denied = false;
  private client: Pick<MealClient, "read" | "plannedRecipe">;
  private account: OfflineAccount;
  private target: ReadPlannedRecipe;
  constructor(
    client: Pick<MealClient, "read" | "plannedRecipe">,
    account: OfflineAccount,
    target: ReadPlannedRecipe,
  ) {
    this.client = client;
    this.account = account;
    this.target = Object.freeze(
      Schema.decodeUnknownSync(ReadPlannedRecipe)(target, { onExcessProperty: "error" }),
    );
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<PlannedRecipeView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load() {
    if (this.disposed) return;
    this.active?.abort();
    const attempt = new AbortController();
    this.active = attempt;
    const current = () => !this.disposed && this.active === attempt;
    this.publish({ busy: true, fresh: false, notice: null });
    await this.cached(current);
    if (current()) await this.refreshed(attempt, current);
  }
  private async cached(current: () => boolean) {
    if (this.denied) return;
    const { store, session } = this.account;
    try {
      const snapshot = await Effect.runPromise(store.readPlannedRecipe(session, this.target));
      if (current()) this.publish({ snapshot });
    } catch (error) {
      if (current()) this.failure(error);
    }
  }
  private async refreshed(attempt: AbortController, current: () => boolean) {
    const { store, session } = this.account;
    try {
      const week = await Effect.runPromise(this.client.read(this.target.weekStart), {
        signal: attempt.signal,
      });
      if (!current()) return;
      const target = { ...this.target, revision: week.revision };
      const received = await Effect.runPromise(this.client.plannedRecipe(target), {
        signal: attempt.signal,
      });
      if (!current()) return;
      const saved = await Effect.runPromise(
        store.savePlannedRecipe(session, { target, snapshot: received }, current),
      );
      if (!current()) return;
      this.denied = false;
      const fresh = saved.revision === received.revision;
      this.publish({
        snapshot: saved,
        fresh,
        access: "ready",
        notice: fresh ? null : "Showing a newer saved plan. Refresh to check its current details.",
      });
    } catch (error) {
      if (current()) this.failure(error);
    } finally {
      if (current()) this.publish({ busy: false });
    }
  }
  private failure(error: unknown) {
    const denied =
      (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code)) ||
      (Schema.is(OfflineFailure)(error) && error.reason === "session_changed");
    if (denied) {
      this.denied = true;
      this.publish({
        snapshot: null,
        fresh: false,
        access: "verify",
        notice: "Verify your account before viewing this meal.",
      });
      return;
    }
    this.publish({
      fresh: false,
      notice: this.denied
        ? "Verify your account before viewing this meal."
        : this.view.snapshot
          ? "Could not refresh. Showing saved details; the plan may have changed."
          : "Could not load this meal. Connect and try again.",
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
