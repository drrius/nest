import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CalendarDate } from "@nest/contracts/chores";
import type { CalendarChore } from "@nest/contracts/calendar-chores";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { CalendarChoreOperations } from "./chore-operations.ts";
export interface CalendarChoreView {
  date: string;
  active: boolean;
  enabled: boolean;
  busy: boolean;
  access: boolean;
  rows: readonly (typeof CalendarChore.Type)[] | null;
  notice: string | null;
}
export class CalendarChoreRuntime {
  private view: CalendarChoreView;
  private disposed = false;
  private request: AbortController | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly operations: CalendarChoreOperations;
  constructor(operations: CalendarChoreOperations, date: string) {
    this.operations = operations;
    this.view = {
      date,
      active: false,
      enabled: false,
      busy: false,
      access: true,
      rows: null,
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
  private publish(patch: Partial<CalendarChoreView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private reset(patch: Partial<CalendarChoreView>) {
    this.request?.abort();
    this.request = null;
    this.publish({ busy: false, rows: null, notice: null, ...patch });
  }
  private failed(error: unknown) {
    const denied =
      (Schema.is(OfflineFailure)(error) && error.reason === "session_changed") ||
      (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code));
    this.publish({
      rows: null,
      access: !denied,
      notice: denied
        ? "Verify your account to read chores."
        : "Could not load chores for this day. Try again when connected.",
    });
  }
  refresh = async () => {
    if (
      this.disposed ||
      !this.view.active ||
      !this.view.enabled ||
      this.view.busy ||
      !this.view.access
    )
      return;
    const request = new AbortController(),
      date = this.view.date;
    this.request = request;
    this.publish({ busy: true, notice: null });
    try {
      const rows = await Effect.runPromise(this.operations.read(date), { signal: request.signal });
      if (!request.signal.aborted) this.publish({ rows });
    } catch (error) {
      if (!request.signal.aborted) this.failed(error);
    } finally {
      if (this.request === request) {
        this.request = null;
        this.publish({ busy: false });
      }
    }
  };
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

export function visibleCalendarChores(view: CalendarChoreView, date: string) {
  return view.active && view.enabled && view.access && view.date === date ? (view.rows ?? []) : [];
}
