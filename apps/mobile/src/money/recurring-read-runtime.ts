import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type {
  RecurringReadTarget,
  RecurringReadEntry,
  RecurringReadOperations,
} from "./recurring-read-operations.ts";
export interface RecurringReadView {
  active: boolean;
  online: boolean;
  busy: boolean;
  verify: boolean;
  target: RecurringReadTarget;
  entry: RecurringReadEntry | null;
  notice: string | null;
}
export class RecurringReadRuntime {
  private view: RecurringReadView;
  private readonly operations: RecurringReadOperations;
  private readonly listeners = new Set<() => void>();
  private request: AbortController | null = null;
  private disposed = false;
  constructor(operations: RecurringReadOperations, target: RecurringReadTarget) {
    this.operations = operations;
    this.view = {
      active: false,
      online: false,
      busy: false,
      verify: false,
      target: { ...target },
      entry: null,
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
  private publish(patch: Partial<RecurringReadView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private interrupt() {
    this.request?.abort();
    this.request = null;
    this.publish({ busy: false, entry: null, notice: null });
  }
  setActive = (active: boolean) => {
    if (this.disposed || active === this.view.active) return Promise.resolve();
    this.interrupt();
    this.publish({ active });
    return active ? this.refresh() : Promise.resolve();
  };
  setOnline = (online: boolean) => {
    if (this.disposed || online === this.view.online) return Promise.resolve();
    this.interrupt();
    this.publish({ online });
    return online ? this.refresh() : Promise.resolve();
  };
  select = (target: RecurringReadTarget) => {
    if (this.disposed || this.view.verify) return Promise.resolve();
    this.interrupt();
    this.publish({ target: { ...target } });
    return this.refresh();
  };
  private current(request: AbortController) {
    return !this.disposed && this.request === request && !request.signal.aborted;
  }
  refresh = async () => {
    if (
      this.disposed ||
      !this.view.active ||
      !this.view.online ||
      this.view.busy ||
      this.view.verify
    )
      return;
    const request = new AbortController();
    this.request = request;
    this.publish({ busy: true, entry: null, notice: null });
    try {
      const entry = await Effect.runPromise(this.operations.read(this.view.target), {
        signal: request.signal,
      });
      if (this.current(request)) this.publish({ entry });
    } catch (error) {
      if (this.current(request)) this.failed(error);
    } finally {
      if (this.current(request)) {
        this.request = null;
        this.publish({ busy: false });
      }
    }
  };
  private failed(error: unknown) {
    const code = Schema.is(PreferenceFailure)(error) ? error.code : null;
    const verify =
      code === "session" ||
      code === "forbidden" ||
      (Schema.is(OfflineFailure)(error) && error.reason === "session_changed");
    this.publish({
      entry: null,
      verify,
      notice: verify
        ? "Verify your account before viewing recurring rules."
        : "Could not load current recurring rules. Try again online.",
    });
  }
  dispose = () => {
    if (this.disposed) return;
    this.interrupt();
    this.publish({ active: false });
    this.disposed = true;
    this.listeners.clear();
  };
}
