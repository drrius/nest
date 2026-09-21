import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ReceiptRecovery } from "@nest/contracts/receipt-recovery";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { ReceiptRecoveryOperations, RecoveryRow } from "./receipt-recovery-operations.ts";
export interface ReceiptRecoveryView {
  active: boolean;
  online: boolean;
  busy: boolean;
  verify: boolean;
  page: ReceiptRecovery | null;
  notice: string | null;
}
export class ReceiptRecoveryRuntime {
  private view: ReceiptRecoveryView = {
    active: false,
    online: false,
    busy: false,
    verify: false,
    page: null,
    notice: null,
  };
  private request: AbortController | null = null;
  private disposed = false;
  private after: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly operations: ReceiptRecoveryOperations;
  constructor(operations: ReceiptRecoveryOperations) {
    this.operations = operations;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<ReceiptRecoveryView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private available() {
    return (
      !this.disposed && this.view.active && this.view.online && !this.view.busy && !this.view.verify
    );
  }
  private current(request: AbortController) {
    return !this.disposed && this.request === request && !request.signal.aborted;
  }
  private hide() {
    this.request?.abort();
    this.request = null;
    this.publish({ page: null, busy: false, notice: null });
  }
  setActive = (active: boolean) => {
    if (this.disposed || this.view.active === active) return Promise.resolve();
    this.hide();
    this.publish({ active });
    return active ? this.refresh(this.after) : Promise.resolve();
  };
  setOnline = (online: boolean) => {
    if (this.disposed || this.view.online === online) return Promise.resolve();
    this.hide();
    this.publish({ online });
    return online ? this.refresh(this.after) : Promise.resolve();
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
  refresh = async (after: string | null = null) => {
    if (!this.available()) return;
    this.after = after;
    this.publish({ page: null });
    await this.perform(async (request) => {
      const page = await Effect.runPromise(this.operations.read(after), { signal: request.signal });
      if (this.current(request)) this.publish({ page });
    });
  };
  next = () => {
    const next = this.view.page?.next;
    return next ? this.refresh(next) : Promise.resolve();
  };
  remove = async (row: RecoveryRow) => {
    if (!this.available() || !this.view.page?.uploads.includes(row)) return;
    await this.perform(async (request) => {
      const result = await Effect.runPromise(this.operations.remove(row), {
        signal: request.signal,
      });
      if (!this.current(request)) return;
      const page = this.view.page;
      this.publish({
        page: page ? { ...page, uploads: page.uploads.filter((value) => value !== row) } : null,
        notice:
          result.status === "claimed"
            ? "This receipt is part of recorded financial history and was retained."
            : "Unattached receipt removed.",
      });
    });
  };
  private failed(error: unknown) {
    const offline = Schema.is(OfflineFailure)(error);
    const denied = offline
      ? error.reason === "session_changed"
      : Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code);
    const pending = offline && error.reason === "pending_edit";
    this.publish({
      page: null,
      verify: denied,
      notice: denied
        ? "Verify your account before viewing uploads."
        : pending
          ? "Resolve the pending expense Save before removing uploads."
          : "Could not confirm the outcome. Reload uploads online before trying again.",
    });
  }
  dispose = () => {
    if (this.disposed) return;
    this.hide();
    this.publish({ active: false });
    this.disposed = true;
    this.listeners.clear();
  };
}
