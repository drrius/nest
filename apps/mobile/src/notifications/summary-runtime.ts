import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type {
  SummaryReadTarget,
  SummaryReadEntry,
  SummaryReadOperations,
} from "./summary-operations.ts";
export interface SummaryReadView {
  active: boolean;
  online: boolean;
  busy: boolean;
  verify: boolean;
  target: SummaryReadTarget;
  entry: SummaryReadEntry | null;
  notice: string | null;
}
export class SummaryReadRuntime {
  private view: SummaryReadView;
  private readonly operations: SummaryReadOperations;
  private readonly listeners = new Set<() => void>();
  private request: AbortController | null = null;
  private disposed = false;
  constructor(operations: SummaryReadOperations, target: SummaryReadTarget) {
    this.operations = operations;
    this.view = {
      active: false,
      online: false,
      busy: false,
      verify: false,
      target,
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
  private publish(patch: Partial<SummaryReadView>) {
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
  private current(request: AbortController) {
    return !this.disposed && this.request === request && !request.signal.aborted;
  }
  refresh = async () => {
    if (this.disposed || !this.view.active || !this.view.online || this.view.busy) return;
    const request = new AbortController();
    this.request = request;
    this.publish({ busy: true, entry: null, notice: null });
    try {
      const entry = await Effect.runPromise(this.operations.read(this.view.target), {
        signal: request.signal,
      });
      if (this.current(request)) this.publish({ entry, verify: false });
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
        ? "Verify your account before viewing this summary."
        : "Could not load this summary. Try again online.",
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
