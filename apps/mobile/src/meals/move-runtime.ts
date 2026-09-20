import type { mealMoveClient } from "./move-client.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MoveMeal, type MealMoveReceipt } from "@nest/contracts/meal-move";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealClient } from "./client.ts";
export type MoveTarget = Readonly<Pick<MoveMeal, "sourceWeekStart" | "entryId">>;
export type MoveView = {
  source: MealWeekSnapshot | null;
  destination: MealWeekSnapshot | null;
  targetWeekStart: string;
  busy: boolean;
  pendingWrite: boolean;
  stage: "ready" | "uncertain" | "reload" | "verify" | "saved";
  notice: string | null;
  receipt: MealMoveReceipt | null;
};
const initial: MoveView = {
  source: null,
  destination: null,
  targetWeekStart: "",
  busy: false,
  pendingWrite: false,
  stage: "ready",
  notice: null,
  receipt: null,
};
export class MealMoveRuntime {
  private view = initial;
  private attempt: MoveMeal | null = null;
  private disposed = false;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  private client: Pick<MealClient, "read"> & { move: ReturnType<typeof mealMoveClient> };
  readonly target: MoveTarget;
  private uuid: () => string;
  constructor(
    client: Pick<MealClient, "read"> & { move: ReturnType<typeof mealMoveClient> },
    target: MoveTarget,
    uuid: () => string,
  ) {
    this.client = client;
    this.target = Object.freeze({ ...target });
    this.uuid = uuid;
    this.view = { ...initial, targetWeekStart: target.sourceWeekStart };
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<MoveView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private async read() {
    const source = await this.run(this.client.read(this.target.sourceWeekStart));
    const destination =
      this.view.targetWeekStart === this.target.sourceWeekStart
        ? source
        : await this.run(this.client.read(this.view.targetWeekStart));
    if (this.disposed) return;
    const receipt = this.view.receipt;
    if (
      receipt &&
      (BigInt(source.revision) < BigInt(receipt.sourceRevision) ||
        BigInt(destination.revision) < BigInt(receipt.targetRevision))
    )
      throw new PreferenceFailure({ code: "unavailable" });
    this.attempt = null;
    this.publish({
      source,
      destination,
      stage: receipt ? "saved" : "ready",
      notice: receipt ? "Move confirmed. These weeks show the current household plan." : null,
    });
  }
  selectWeek = async (targetWeekStart: string) => {
    if (
      this.disposed ||
      this.view.busy ||
      this.attempt ||
      this.view.receipt ||
      this.view.stage === "verify"
    )
      return;
    this.publish({ targetWeekStart, destination: null, stage: "reload" });
    await this.load();
  };
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
  save = async (destination: Pick<MoveMeal, "date" | "slot">) => {
    const { source, destination: week } = this.view;
    if (this.disposed || this.view.busy || this.view.stage !== "ready" || !source || !week) return;
    if (!source.entries.some((entry) => entry.entryId === this.target.entryId.toLowerCase())) {
      this.publish({
        notice: "This meal is no longer in its original week. Return to the current plan.",
      });
      return;
    }
    if (
      week.entries.some(
        (entry) => entry.date === destination.date && entry.slot === destination.slot,
      )
    ) {
      this.publish({ notice: "Choose an empty meal slot. Moving does not replace another meal." });
      return;
    }
    const parsed = Schema.decodeUnknownExit(MoveMeal)(
      {
        operationId: this.uuid(),
        ...this.target,
        ...destination,
        targetWeekStart: week.weekStart,
        expectedSourceRevision: source.revision,
        expectedTargetRevision: week.revision,
      },
      { onExcessProperty: "error" },
    );
    if (parsed._tag === "Failure") {
      this.publish({ notice: "Choose a valid destination from the current week." });
      return;
    }
    this.attempt = { ...parsed.value };
    await this.send();
  };
  private async send() {
    if (this.disposed || !this.attempt) return;
    this.publish({ busy: true, pendingWrite: true, notice: null });
    try {
      const receipt = await this.run(this.client.move(this.attempt));
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
        source: null,
        destination: null,
        receipt: null,
        stage: "verify",
        pendingWrite: false,
        notice: "Verify your account before moving meals.",
      });
    } else if (this.view.stage === "verify") {
      this.publish({ notice: "Your account could not be verified. Try again online." });
    } else if (this.view.receipt) {
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice: "Your meal moved, but the weeks could not refresh. Reload without moving it again.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "A week changed or this meal could not move. Reload both weeks and choose a destination again.",
      });
    } else this.unavailable();
  }
  private unavailable() {
    this.publish({
      stage: this.attempt ? "uncertain" : "reload",
      notice: this.attempt
        ? "Your meal could not be confirmed. Retry this exact request before making another change."
        : "Could not load the current weeks. Connect and try again.",
    });
  }
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.attempt = null;
    this.listeners.clear();
  }
}
