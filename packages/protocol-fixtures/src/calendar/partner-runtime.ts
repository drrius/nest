import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { BusySnapshot } from "@nest/contracts/calendar";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { PartnerOperations } from "./partner-operations.ts";
export interface PartnerView {
  asOf: number;
  active: boolean;
  busy: boolean;
  access: boolean;
  snapshots: readonly BusySnapshot[] | null;
  notice: string | null;
}
export class PartnerRuntime {
  private view: PartnerView = {
    asOf: 0,
    active: false,
    busy: false,
    access: true,
    snapshots: null,
    notice: null,
  };
  private disposed = false;
  private request: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly operations: PartnerOperations;
  private readonly now: () => number;
  constructor(operations: PartnerOperations, now: () => number) {
    this.operations = operations;
    this.now = now;
  }
  get actor() {
    return this.operations.actor;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<PartnerView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch, asOf: this.now() };
    for (const listener of this.listeners) listener();
  }
  private stopTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
  expire = () => {
    this.stopTimer();
    const partners =
      this.view.snapshots?.filter((snapshot) => snapshot.actorId !== this.actor) ?? [];
    if (partners.length !== 1) return;
    const partner = partners[0]!,
      remaining = Date.parse(partner.expiresAt) - this.now();
    if (remaining <= 0 || Date.parse(partner.capturedAt) > this.now()) {
      this.publish({
        snapshots: null,
        notice: "Shared availability is no longer fresh. Refresh to check again.",
      });
      return;
    }
    this.timer = setTimeout(this.expire, Math.min(remaining, 2147483647));
  };
  private failed(error: unknown) {
    const denied =
      (Schema.is(OfflineFailure)(error) && error.reason === "session_changed") ||
      (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code));
    this.publish({
      snapshots: null,
      access: !denied,
      notice: denied
        ? "Verify your account to read shared availability."
        : "Could not refresh shared availability. Your partner's availability is unknown.",
    });
    this.stopTimer();
  }
  refresh = async () => {
    if (this.disposed || !this.view.active || this.view.busy || !this.view.access) return;
    const request = new AbortController();
    this.request = request;
    this.publish({ busy: true, notice: null });
    try {
      const snapshots = await Effect.runPromise(this.operations.read(), { signal: request.signal });
      if (!request.signal.aborted) {
        this.publish({ snapshots });
        this.expire();
      }
    } catch (error) {
      if (!request.signal.aborted) this.failed(error);
    } finally {
      if (this.request === request) {
        this.request = null;
        this.publish({ busy: false });
      }
    }
  };
  setActive = (active: boolean) => {
    if (this.disposed || active === this.view.active) return Promise.resolve();
    this.request?.abort();
    this.request = null;
    this.stopTimer();
    this.publish({ active, busy: false, snapshots: null, notice: null });
    return active ? this.refresh() : Promise.resolve();
  };
  dispose = () => {
    if (this.disposed) return;
    void this.setActive(false);
    this.disposed = true;
    this.listeners.clear();
  };
}
