import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type {
  DurableSaveView,
  DurableSaveOperations,
  DurableSaveOptions,
  SaveAttempt,
  SaveOutcome,
} from "./durable-save-types.ts";
export class DurableSaveRuntime<C, R extends SaveOutcome> {
  private view: DurableSaveView<C, R> = {
    active: false,
    online: false,
    busy: false,
    fresh: false,
    verify: false,
    attempt: null,
    result: null,
    notice: null,
  };
  private readonly operations: DurableSaveOperations<C, R>;
  private readonly listeners = new Set<() => void>();
  private request: AbortController | null = null;
  private disposed = false;
  private completed: R | null = null;
  private readonly options: DurableSaveOptions<C>;
  constructor(operations: DurableSaveOperations<C, R>, options: DurableSaveOptions<C>) {
    this.operations = operations;
    this.options = options;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<DurableSaveView<C, R>>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private current(request: AbortController) {
    return !this.disposed && this.request === request && !request.signal.aborted;
  }
  private available() {
    return !this.disposed && this.view.active && !this.view.busy && !this.view.verify;
  }
  setActive = (active: boolean) => {
    if (this.disposed || active === this.view.active) return Promise.resolve();
    this.request?.abort();
    this.request = null;
    this.publish({ active, busy: false, fresh: false, attempt: null, result: null, notice: null });
    return active ? this.refresh() : Promise.resolve();
  };
  setOnline = (online: boolean) => {
    if (this.disposed || online === this.view.online) return Promise.resolve();
    this.request?.abort();
    this.request = null;
    this.publish({ online, busy: false, fresh: false });
    return online ? this.refresh() : Promise.resolve();
  };
  private async perform(body: (request: AbortController) => Promise<void>) {
    const request = new AbortController();
    this.request = request;
    this.publish({ busy: true, notice: null });
    try {
      await body(request);
    } catch (error) {
      if (this.current(request)) this.failed(error);
    } finally {
      if (this.current(request)) {
        this.request = null;
        this.publish({ busy: false });
      }
    }
  }
  refresh = async () => {
    if (!this.available()) return;
    this.publish({ fresh: false });
    await this.perform(async (request) => {
      const attempt = await Effect.runPromise(this.operations.saved(), { signal: request.signal });
      if (!this.current(request)) return;
      this.publish({ attempt });
      if (!attempt) {
        this.publish({ fresh: true, result: this.completed });
        return;
      }
      if (!this.view.online) {
        this.publish({ notice: `Go online to check the earlier ${this.options.label}.` });
        return;
      }
      const result = await Effect.runPromise(this.operations.read(attempt), {
        signal: request.signal,
      });
      if (this.current(request)) await this.accept(attempt, result, request);
    });
  };
  save = async (input: C) => {
    if (!this.canWrite() || this.view.attempt || this.view.result) return;
    await this.perform(async (request) => {
      const attempt = this.options.prepare(input);
      await this.stage(attempt, request);
      if (this.current(request)) await this.send(attempt, request);
    });
  };
  cancel = async (expected: SaveAttempt<C>) => {
    if (!this.canWrite() || this.view.attempt !== expected || this.terminal()) return;
    await this.perform(async (request) => {
      const attempt: SaveAttempt<C> = { ...expected, action: "cancel" };
      await this.stage(attempt, request);
      if (this.current(request)) await this.send(attempt, request);
    });
  };
  retry = async () => {
    const attempt = this.view.attempt;
    if (!this.canWrite() || !attempt || this.terminal()) return;
    await this.perform(async (request) => {
      await this.stage(attempt, request);
      if (this.current(request)) await this.send(attempt, request);
    });
  };
  private canWrite() {
    return this.available() && this.view.online && this.view.fresh;
  }
  private terminal() {
    return this.view.result !== null && this.view.result.status !== "unresolved";
  }
  private async stage(attempt: SaveAttempt<C>, request: AbortController) {
    await Effect.runPromise(
      this.operations.stage(attempt, () => this.current(request)),
      { signal: request.signal },
    );
    if (this.current(request)) this.publish({ attempt });
  }
  private async send(attempt: SaveAttempt<C>, request: AbortController) {
    const result = await Effect.runPromise(this.operations.send(attempt), {
      signal: request.signal,
    });
    if (this.current(request)) await this.accept(attempt, result, request);
  }
  private async accept(attempt: SaveAttempt<C>, result: R, request: AbortController) {
    if (result.status !== "unresolved") this.completed = result;
    this.publish({
      result,
      fresh: true,
      notice:
        result.status === "unresolved"
          ? `This ${this.options.label} is unresolved. Check again, retry the exact attempt, or cancel it before editing.`
          : null,
    });
    if (result.status === "unresolved") return;
    await Effect.runPromise(this.operations.clear(attempt), { signal: request.signal });
    if (this.current(request)) this.publish({ attempt: null });
  }
  acknowledge = () => {
    if (!this.available() || !this.view.fresh || this.view.attempt || !this.terminal()) return;
    this.completed = null;
    this.publish({ result: null, notice: null });
  };
  private failed(error: unknown) {
    const storage = Schema.is(OfflineFailure)(error) ? error.reason : null;
    const code = Schema.is(PreferenceFailure)(error) ? error.code : null;
    if (storage === "session_changed" || code === "session" || code === "forbidden") {
      this.completed = null;
      this.publish({
        attempt: null,
        result: null,
        fresh: false,
        verify: true,
        notice: `Verify your account before opening this ${this.options.label}.`,
      });
      return;
    }
    this.publish({
      fresh: false,
      notice: this.terminal()
        ? "The server confirmed this outcome. Reload to finish local recovery."
        : `Could not confirm this ${this.options.label}. Check its status online before continuing.`,
    });
  }
  dispose = () => {
    if (this.disposed) return;
    this.request?.abort();
    this.request = null;
    this.publish({
      active: false,
      busy: false,
      fresh: false,
      attempt: null,
      result: null,
      notice: null,
    });
    this.completed = null;
    this.disposed = true;
    this.listeners.clear();
  };
}
