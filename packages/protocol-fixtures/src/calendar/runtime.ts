import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { CalendarConsent } from "@nest/contracts/calendar";
import { PreferenceFailure } from "../preferences/client.ts";
import { sameConsent, type CalendarSelection } from "./selection.ts";
import type { CalendarOperations } from "./operations.ts";
import type { LocalCalendar } from "./service.ts";
export interface CalendarView {
  loaded: boolean;
  busy: boolean;
  stage: "ready" | "uncertain" | "reload" | "verify";
  consent: CalendarConsent | null;
  selection: CalendarSelection | null;
  calendars: readonly LocalCalendar[];
  permission: boolean;
  notice: string | null;
  expiresAt: string | null;
}
const initial: CalendarView = {
  loaded: false,
  busy: false,
  stage: "ready",
  consent: null,
  selection: null,
  calendars: [],
  permission: false,
  notice: null,
  expiresAt: null,
};
export class CalendarRuntime {
  private view = initial;
  private disposed = false;
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly operations: CalendarOperations;
  private readonly now: () => number;
  constructor(operations: CalendarOperations, now: () => number) {
    this.operations = operations;
    this.now = now;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<CalendarView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A, E>(effect: Effect.Effect<A, E>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private async task(body: () => Promise<void>) {
    if (this.disposed || this.view.busy) return;
    this.publish({ busy: true, notice: null });
    try {
      await body();
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  }
  private failed(error: unknown) {
    if (this.disposed) return;
    const code = Schema.is(PreferenceFailure)(error) ? error.code : "unavailable";
    if (code === "session" || code === "forbidden") {
      this.publish({
        ...initial,
        stage: "verify",
        notice: "Verify your account before accessing calendar sharing.",
      });
      return;
    }
    this.publish({
      stage: this.view.selection?.status === "pending" ? "uncertain" : "reload",
      expiresAt: null,
      notice:
        code === "conflict"
          ? "Sharing changed on another device. Reload before continuing."
          : "Could not confirm calendar sharing. Retry online before making more changes.",
    });
  }
  load = () =>
    this.task(async () => {
      const result = await this.run(this.operations.load());
      this.publish({
        loaded: true,
        expiresAt:
          this.view.consent && sameConsent(this.view.consent, result.consent)
            ? this.view.expiresAt
            : null,
        consent: result.consent,
        selection: result.selection,
        permission: result.local.status === "ready",
        calendars: result.local.status === "ready" ? result.local.calendars : [],
        stage: result.selection?.status === "pending" ? "uncertain" : "ready",
        notice:
          result.selection?.status === "pending"
            ? "A sharing change needs confirmation. Retry the saved request."
            : null,
      });
    });
  requestPermission = () =>
    this.task(async () => {
      if (this.view.stage !== "ready") return;
      await this.run(this.operations.permission);
      const local = await this.run(this.operations.local);
      this.publish({
        permission: local.status === "ready",
        calendars: local.status === "ready" ? local.calendars : [],
        notice:
          local.status === "ready"
            ? null
            : "Calendar access is off. You can enable it in iPhone Settings; other Nest features still work.",
      });
    });
  change = (ids: readonly string[], enabled: boolean) =>
    this.task(async () => {
      if (!this.view.loaded || this.view.stage !== "ready" || !this.view.consent) return;
      if (enabled) {
        const local = await this.run(this.operations.local);
        if (
          local.status !== "ready" ||
          ids.some((id) => !local.calendars.some((calendar) => calendar.id === id))
        ) {
          this.publish({
            notice: "Choose calendars that are available on this iPhone before sharing.",
          });
          return;
        }
      }
      const attempt = await this.run(this.operations.stage(this.view.consent, [...ids], enabled));
      this.publish({ selection: attempt, expiresAt: null });
      const result = await this.run(this.operations.resolve(attempt));
      this.publish({
        ...result,
        stage: "ready",
        notice: result.selection
          ? "Selected calendars are saved. Refresh busy times to publish availability."
          : "Current sharing settings loaded.",
      });
    });
  retry = () =>
    this.task(async () => {
      if (this.view.selection?.status !== "pending") return;
      const result = await this.run(this.operations.resolve(this.view.selection));
      this.publish({
        ...result,
        stage: "ready",
        notice: "Sharing change confirmed. Current settings are loaded.",
      });
    });
  refresh = () =>
    this.task(async () => {
      if (this.view.stage !== "ready" || this.view.selection?.status !== "active") return;
      const result = await this.run(this.operations.refresh(this.view.selection, this.now()));
      if (result.status === "published")
        this.publish({
          expiresAt: result.expiresAt,
          notice: "Busy times refreshed. Only time ranges were shared.",
        });
      else if (result.status === "revoked")
        this.publish({
          ...result,
          permission: false,
          calendars: [],
          expiresAt: null,
          notice: result.consent.enabled
            ? "This iPhone stopped publishing. Sharing settings changed on another device."
            : "Calendar access changed. Sharing was turned off and published busy times removed.",
        });
      else
        this.publish({
          expiresAt: null,
          notice: "Availability is unknown. No new busy times were published.",
        });
    });
  dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.lifetime.abort();
    this.view = initial;
    this.listeners.clear();
  };
}
