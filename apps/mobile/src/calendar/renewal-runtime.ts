import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CalendarDate } from "@nest/contracts/chores";
import type { Renewal } from "@nest/contracts/renewals";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { CalendarRenewalOperations } from "./renewal-operations.ts";
export interface CalendarRenewalView {
  date: string;
  active: boolean;
  enabled: boolean;
  busy: boolean;
  access: boolean;
  rows: readonly (typeof Renewal.Type)[] | null;
  notice: string | null;
  next: string | null;
}
export class CalendarRenewalRuntime {
  private view: CalendarRenewalView;
  private disposed = false;
  private request: AbortController | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly operations: CalendarRenewalOperations;
  constructor(operations: CalendarRenewalOperations, date: string) {
    this.operations = operations;
    this.view = {
      date,
      active: false,
      enabled: false,
      busy: false,
      access: true,
      rows: null,
      notice: null,
      next: null,
    };
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<CalendarRenewalView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private reset(patch: Partial<CalendarRenewalView>) {
    this.request?.abort();
    this.request = null;
    this.publish({ busy: false, rows: null, next: null, notice: null, ...patch });
  }
  private failed(error: unknown) {
    const denied =
      (Schema.is(OfflineFailure)(error) && error.reason === "session_changed") ||
      (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code));
    this.publish({
      rows: null,
      next: null,
      access: !denied,
      notice: denied
        ? "Verify your account to read renewals."
        : "Could not load renewals for this day. Try again when connected.",
    });
  }
  private canLoad(more: boolean) {
    return (
      !this.disposed &&
      this.view.active &&
      this.view.enabled &&
      !this.view.busy &&
      this.view.access &&
      (!more || this.view.next !== null)
    );
  }
  private load = async (more: boolean) => {
    if (!this.canLoad(more)) return;
    const request = new AbortController(),
      date = this.view.date;
    const after = more ? this.view.next : null;
    this.request = request;
    this.publish({ busy: true, notice: null });
    try {
      const page = await Effect.runPromise(this.operations.read(date, after), {
        signal: request.signal,
      });
      if (!request.signal.aborted)
        this.publish({
          rows: more ? [...(this.view.rows ?? []), ...page.renewals] : page.renewals,
          next: page.next,
        });
    } catch (error) {
      if (!request.signal.aborted) this.failed(error);
    } finally {
      if (this.request === request) {
        this.request = null;
        this.publish({ busy: false });
      }
    }
  };
  refresh = () => this.load(false);
  loadMore = () => this.load(true);
  changeDate = (date: string) => {
    if (this.disposed || date === this.view.date || !Schema.is(CalendarDate)(date))
      return Promise.resolve();
    this.reset({ date });
    return this.refresh();
  };
  setEnabled = (enabled: boolean) => {
    if (this.disposed || enabled === this.view.enabled) return Promise.resolve();
    this.reset({ enabled });
    return this.refresh();
  };
  setActive = (active: boolean) => {
    if (this.disposed || active === this.view.active) return Promise.resolve();
    this.reset({ active });
    return this.refresh();
  };
  dispose = () => {
    if (this.disposed) return;
    this.reset({ active: false });
    this.disposed = true;
    this.listeners.clear();
  };
}

export function visibleCalendarRenewals(view: CalendarRenewalView, date: string) {
  return view.active && view.enabled && view.access && view.date === date ? (view.rows ?? []) : [];
}
