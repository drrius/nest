import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MealWeekStart, type MealWeekSnapshot } from "@nest/contracts/meals";
import type { OfflineAccount } from "../offline/owner.ts";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealClient } from "./client.ts";

export interface MealWeekView {
  weekStart: string;
  snapshot: MealWeekSnapshot | null;
  busy: boolean;
  fresh: boolean;
  notice: string | null;
  access: "ready" | "verify";
}
export class MealWeekRuntime {
  private view: MealWeekView;
  private listeners = new Set<() => void>();
  private active: AbortController | null = null;
  private disposed = false;
  private denied = false;
  private client: MealClient;
  private account: OfflineAccount;
  constructor(client: MealClient, account: OfflineAccount, weekStart: string) {
    this.client = client;
    this.account = account;
    if (!Schema.is(MealWeekStart)(weekStart)) throw new Error("Invalid meal week");
    this.view = {
      weekStart,
      snapshot: null,
      busy: false,
      fresh: false,
      notice: null,
      access: "ready",
    };
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<MealWeekView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  async load(weekStart = this.view.weekStart) {
    if (this.disposed || !Schema.is(MealWeekStart)(weekStart)) return;
    this.active?.abort();
    const attempt = new AbortController();
    this.active = attempt;
    const current = () => !this.disposed && this.active === attempt;
    this.publish({
      weekStart,
      busy: true,
      fresh: false,
      notice: null,
      snapshot: this.denied || weekStart !== this.view.weekStart ? null : this.view.snapshot,
    });
    await this.cached(weekStart, current);
    if (current()) await this.refreshed(weekStart, attempt, current);
  }
  private async cached(weekStart: string, current: () => boolean) {
    if (this.denied) return;
    const { store, session } = this.account;
    try {
      const cached = await Effect.runPromise(store.readMealWeek(session, weekStart));
      if (current()) this.publish({ snapshot: cached });
    } catch {
      if (current()) this.publish({ notice: "Could not read the saved week. Trying to refresh…" });
    }
  }
  private async refreshed(weekStart: string, attempt: AbortController, current: () => boolean) {
    const { store, session } = this.account;
    try {
      const received = await Effect.runPromise(this.client.read(weekStart), {
        signal: attempt.signal,
      });
      if (!current()) return;
      const saved = await Effect.runPromise(store.saveMealWeek(session, received));
      if (!current()) return;
      this.denied = false;
      const fresh = saved.revision === received.revision;
      this.publish({
        snapshot: saved,
        fresh,
        access: "ready",
        notice: fresh ? null : "Showing a newer saved week. Refresh to check the latest plan.",
      });
    } catch (error) {
      if (!current()) return;
      this.failure(error);
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
        notice: "Verify your account before viewing meals.",
      });
    } else
      this.publish({
        fresh: false,
        notice: this.view.snapshot
          ? "Could not refresh. Showing the saved week; it may have changed."
          : "Could not load this week. Connect and try again.",
      });
  }
  cancel() {
    this.active?.abort();
    this.active = null;
    this.publish({ busy: false });
  }
  dispose() {
    this.disposed = true;
    this.active?.abort();
    this.listeners.clear();
  }
}
