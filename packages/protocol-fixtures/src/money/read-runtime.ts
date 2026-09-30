import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MoneyCacheEntry, MoneyCacheTarget } from "../offline/money-contract.ts";
import { moneyTargetKey } from "../offline/money-contract.ts";
import type { MoneyReadOperations } from "./read-operations.ts";
export interface MoneyReadView {
  target: MoneyCacheTarget;
  entry: MoneyCacheEntry | null;
  active: boolean;
  busy: boolean;
  source: "none" | "saved" | "previous" | "online";
  access: "ready" | "verify";
  notice: string | null;
}
export class MoneyReadRuntime {
  private view: MoneyReadView;
  private readonly operations: MoneyReadOperations;
  private request: AbortController | null = null;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  constructor(operations: MoneyReadOperations, target: MoneyCacheTarget) {
    this.operations = operations;
    this.view = {
      target,
      entry: null,
      active: false,
      busy: false,
      source: "none",
      access: "ready",
      notice: null,
    };
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<MoneyReadView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private cancel() {
    this.request?.abort();
    this.request = null;
    this.publish({ busy: false });
  }
  changeTarget = (target: MoneyCacheTarget) => {
    if (
      this.disposed ||
      (target.kind === this.view.target.kind &&
        moneyTargetKey(target) === moneyTargetKey(this.view.target))
    )
      return Promise.resolve();
    this.cancel();
    this.publish({ target, entry: null, source: "none", notice: null });
    return this.refresh();
  };
  setActive = (active: boolean) => {
    if (this.disposed || active === this.view.active) return Promise.resolve();
    this.cancel();
    this.publish({ active, entry: null, source: "none", notice: null });
    return this.refresh();
  };
  refresh = async () => {
    if (this.disposed || !this.view.active || this.view.access !== "ready") return;
    this.cancel();
    const request = new AbortController(),
      target = this.view.target;
    this.request = request;
    const current = () => !this.disposed && this.request === request && !request.signal.aborted;
    this.publish({ busy: true, notice: null, source: this.view.entry ? "previous" : "none" });
    try {
      await this.hydrate(target, current, request.signal);
      if (!current()) return;
      const entry = await Effect.runPromise(this.operations.remote(target), {
        signal: request.signal,
      });
      if (!current()) return;
      this.publish({ entry, source: "online" });
      await this.save(entry, current, request.signal);
    } catch (error) {
      if (current()) await this.failed(error, current);
    } finally {
      if (current()) {
        this.request = null;
        this.publish({ busy: false });
      }
    }
  };
  private async hydrate(target: MoneyCacheTarget, current: () => boolean, signal: AbortSignal) {
    try {
      const entry = await Effect.runPromise(this.operations.cached(target), { signal });
      if (current() && entry !== null && this.view.entry === null)
        this.publish({ entry, source: "saved" });
    } catch (error) {
      if (denied(error)) throw error;
      // A corrupt cache must not prevent an authorized online read from repairing it.
      if (current()) this.publish({ notice: "Saved view unavailable. Trying online…" });
    }
  }
  private async save(entry: MoneyCacheEntry, current: () => boolean, signal: AbortSignal) {
    try {
      await Effect.runPromise(this.operations.save(entry, current), { signal });
      if (current()) this.publish({ notice: null });
    } catch (error) {
      if (denied(error)) throw error;
      if (current())
        this.publish({ notice: "Loaded online, but could not save this view for offline use." });
    }
  }
  private async failed(error: unknown, current: () => boolean) {
    if (denied(error)) {
      this.denyAccess();
      try {
        await Effect.runPromise(this.operations.clear());
      } catch {
        /* A changed lease cannot clear a different account. */
      }
      return;
    }
    if (current())
      this.publish({
        notice: this.view.entry
          ? "Could not refresh. Showing a previously loaded view; amounts may have changed."
          : "Could not load this view. Connect and try again.",
      });
  }
  denyAccess = () => {
    if (this.disposed || this.view.access === "verify") return;
    this.request?.abort();
    this.request = null;
    this.publish({
      busy: false,
      entry: null,
      source: "none",
      access: "verify",
      notice: "Verify your account before viewing Money.",
    });
  };
  dispose = () => {
    if (this.disposed) return;
    this.cancel();
    this.publish({ entry: null, source: "none", active: false });
    this.disposed = true;
    this.listeners.clear();
  };
}
function denied(error: unknown) {
  return (
    (Schema.is(OfflineFailure)(error) && error.reason === "session_changed") ||
    (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code))
  );
}
