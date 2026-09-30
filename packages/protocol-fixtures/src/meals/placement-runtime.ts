import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PlaceMeal, type MealPlacementReceipt } from "@nest/contracts/meal-placement";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealClient } from "./client.ts";
export type PlacementTarget = Readonly<Pick<PlaceMeal, "weekStart" | "date" | "slot">>;
export type PlacementView = {
  snapshot: MealWeekSnapshot | null;
  busy: boolean;
  pendingWrite: boolean;
  stage: "ready" | "uncertain" | "reload" | "verify" | "saved";
  notice: string | null;
  receipt: MealPlacementReceipt | null;
};
const initial: PlacementView = {
  snapshot: null,
  busy: false,
  pendingWrite: false,
  stage: "ready",
  notice: null,
  receipt: null,
};
export class MealPlacementRuntime {
  private view = initial;
  private attempt: PlaceMeal | null = null;
  private disposed = false;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  private client: MealClient;
  readonly target: PlacementTarget;
  private uuid: () => string;
  constructor(client: MealClient, target: PlacementTarget, uuid: () => string) {
    this.client = client;
    this.target = Object.freeze({ ...target });
    this.uuid = uuid;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<PlacementView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private async read() {
    const snapshot = await this.run(this.client.read(this.target.weekStart));
    if (this.disposed) return;
    if (this.view.receipt && BigInt(snapshot.revision) < BigInt(this.view.receipt.revision))
      throw new PreferenceFailure({ code: "unavailable" });
    this.attempt = null;
    this.publish({
      snapshot,
      stage: this.view.receipt ? "saved" : "ready",
      notice: this.view.receipt
        ? "Your meal was added. The week now shows the current household plan."
        : null,
    });
  }
  load = async () => {
    if (this.disposed || this.view.busy || (this.attempt && !this.view.receipt)) return;
    this.publish({ busy: true });
    try {
      await this.read();
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  };
  save = async (title: string) => {
    if (this.disposed || this.view.busy || this.view.stage !== "ready" || !this.view.snapshot)
      return;
    if (
      this.view.snapshot.entries.some(
        (entry) => entry.date === this.target.date && entry.slot === this.target.slot,
      )
    ) {
      this.publish({
        notice: "This slot already has a meal. Return to the week to choose another slot.",
      });
      return;
    }
    const parsed = Schema.decodeUnknownExit(PlaceMeal)(
      {
        operationId: this.uuid(),
        ...this.target,
        expectedRevision: this.view.snapshot.revision,
        title,
      },
      { onExcessProperty: "error" },
    );
    if (parsed._tag === "Failure") {
      this.publish({ notice: "Enter a meal title of up to 120 characters." });
      return;
    }
    this.attempt = { ...parsed.value };
    await this.send();
  };
  private async send() {
    if (this.disposed || !this.attempt) return;
    this.publish({ busy: true, pendingWrite: true, notice: null });
    try {
      const receipt = await this.run(this.client.place(this.attempt));
      if (this.disposed) return;
      this.publish({ receipt, pendingWrite: false });
      await this.read();
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  }
  retry = async () => {
    if (!this.view.busy && this.view.stage === "uncertain") await this.send();
  };
  private failed(error: unknown) {
    if (this.disposed) return;
    const code = Schema.is(PreferenceFailure)(error) ? error.code : "unavailable";
    if (code === "session" || code === "forbidden") {
      this.attempt = null;
      this.publish({
        snapshot: null,
        receipt: null,
        stage: "verify",
        pendingWrite: false,
        notice: "Verify your account before adding meals.",
      });
    } else if (this.view.stage === "verify") {
      this.publish({ notice: "Your account could not be verified. Try again online." });
    } else if (this.view.receipt) {
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "Your meal was added, but the week could not refresh. Reload the week; do not add it again.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "The week changed or this meal could not be added. Reload and check the slot before trying again.",
      });
    } else this.unavailable();
  }
  private unavailable() {
    this.publish({
      stage: this.attempt ? "uncertain" : "reload",
      notice: this.attempt
        ? "Your meal could not be confirmed. Retry this exact request before making another change."
        : "Could not load the current week. Connect and try again.",
    });
  }
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.attempt = null;
    this.listeners.clear();
  }
}
