import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "../offline/contracts.ts";
import { agendaDay } from "./agenda-day.ts";
import type { AgendaResult } from "./agenda.ts";
import type { AgendaSelection } from "./agenda-selection.ts";
import { AgendaFailure, type AgendaOperations } from "./agenda-operations.ts";
import type { LocalCalendar } from "./service.ts";
export interface AgendaView {
  date: string;
  active: boolean;
  busy: boolean;
  access: boolean;
  loaded: boolean;
  permission: boolean;
  selection: AgendaSelection | null;
  calendars: readonly LocalCalendar[];
  result: AgendaResult | null;
  notice: string | null;
}
export class AgendaRuntime {
  private view: AgendaView;
  private disposed = false;
  private attempt: AbortController | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly operations: AgendaOperations;
  constructor(operations: AgendaOperations, date: string) {
    this.operations = operations;
    this.view = {
      date,
      active: false,
      busy: false,
      access: true,
      loaded: false,
      permission: false,
      selection: null,
      calendars: [],
      result: null,
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
  private publish(patch: Partial<AgendaView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private async task(body: (signal: AbortSignal) => Promise<void>) {
    if (this.disposed || !this.view.active || this.view.busy || !this.view.access) return;
    const attempt = new AbortController();
    this.attempt = attempt;
    this.publish({ busy: true, notice: null });
    try {
      await body(attempt.signal);
    } catch (error) {
      if (!attempt.signal.aborted) this.failed(error);
    } finally {
      if (this.attempt === attempt) {
        this.attempt = null;
        this.publish({ busy: false });
      }
    }
  }
  private failed(error: unknown) {
    if (Schema.is(OfflineFailure)(error) && error.reason === "session_changed") {
      this.publish({
        access: false,
        result: null,
        calendars: [],
        selection: null,
        loaded: false,
        notice: "Verify your account before opening your calendar.",
      });
      return;
    }
    this.publish({
      result: null,
      notice:
        Schema.is(AgendaFailure)(error) && error.code === "missing_calendar"
          ? "Calendar access changed. Reload and choose calendars available on this iPhone."
          : "Could not load or save your calendar choices. Retry; your last saved selection is retained.",
    });
  }
  private run<A, E>(work: Effect.Effect<A, E>, signal: AbortSignal) {
    return Effect.runPromise(work, { signal });
  }
  private async read(signal: AbortSignal) {
    const window = agendaDay(this.view.date);
    if (!window) {
      this.publish({ result: { status: "unavailable", reason: "invalid_events" } });
      return;
    }
    const result = await this.run(
      this.operations.read(this.view.selection?.calendarIds ?? [], window),
      signal,
    );
    if (!signal.aborted)
      this.publish({
        result,
        ...(result.status === "unavailable" && result.reason === "permission"
          ? { permission: false, calendars: [] }
          : {}),
      });
  }
  private async load(signal: AbortSignal) {
    const value = await this.run(this.operations.load(), signal);
    if (signal.aborted) return;
    this.publish({
      loaded: true,
      selection: value.selection,
      permission: value.catalog.status === "ready",
      calendars: value.catalog.status === "ready" ? value.catalog.calendars : [],
      result: null,
    });
    if (value.catalog.status === "ready") await this.read(signal);
  }
  refresh = () => this.task((signal) => this.load(signal));
  setActive = (active: boolean) => {
    if (this.disposed || this.view.active === active) return;
    this.attempt?.abort();
    this.attempt = null;
    this.publish({
      active,
      busy: false,
      loaded: false,
      calendars: [],
      result: null,
      selection: null,
      notice: null,
    });
    if (active) void this.refresh();
  };
  changeDate = (date: string) =>
    this.task(async (signal) => {
      if (!agendaDay(date)) return;
      this.publish({ date, result: null });
      await this.read(signal);
    });
  changeSelection = (ids: readonly string[]) => {
    const selection = { calendarIds: [...ids] };
    return this.task(async (signal) => {
      const saved = await this.run(this.operations.save(selection), signal);
      if (signal.aborted) return;
      this.publish({ selection: saved, result: null });
      await this.read(signal);
    });
  };
  requestPermission = () =>
    this.task(async (signal) => {
      await this.run(this.operations.permission(), signal);
      if (!signal.aborted) await this.load(signal);
    });
  dispose = () => {
    if (this.disposed) return;
    this.setActive(false);
    this.disposed = true;
    this.listeners.clear();
  };
}
