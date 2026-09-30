import type { mealRemovalClient } from "./removal-client.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { RemoveMeal, type MealRemovalReceipt } from "@nest/contracts/meal-removal";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealClient } from "./client.ts";
export type RemovalTarget = Readonly<Pick<RemoveMeal, "weekStart" | "entryId">>;
export type RemovalView = {
  snapshot: MealWeekSnapshot | null;
  busy: boolean;
  pendingWrite: boolean;
  stage: "ready" | "uncertain" | "reload" | "verify" | "saved";
  notice: string | null;
  receipt: MealRemovalReceipt | null;
};
const initial: RemovalView = {
  snapshot: null,
  busy: false,
  pendingWrite: false,
  stage: "ready",
  notice: null,
  receipt: null,
};
export class MealRemovalRuntime {
  private view = initial;
  private attempt: RemoveMeal | null = null;
  private disposed = false;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  private client: Pick<MealClient, "read"> & { remove: ReturnType<typeof mealRemovalClient> };
  readonly target: RemovalTarget;
  private uuid: () => string;
  constructor(
    client: Pick<MealClient, "read"> & { remove: ReturnType<typeof mealRemovalClient> },
    target: RemovalTarget,
    uuid: () => string,
  ) {
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
  private publish(patch: Partial<RemovalView>) {
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
        ? "Your meal was removed. The week now shows the current household plan."
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
  save = async () => {
    if (this.disposed || this.view.busy || this.view.stage !== "ready" || !this.view.snapshot)
      return;
    if (
      !this.view.snapshot.entries.some(
        (entry) => entry.entryId === this.target.entryId.toLowerCase(),
      )
    ) {
      this.publish({
        notice: "This meal is no longer in this week. Return to the current plan.",
      });
      return;
    }
    const parsed = Schema.decodeUnknownExit(RemoveMeal)(
      {
        operationId: this.uuid(),
        ...this.target,
        expectedRevision: this.view.snapshot.revision,
      },
      { onExcessProperty: "error" },
    );
    if (parsed._tag === "Failure") {
      this.publish({ notice: "This removal target is invalid. Open it from the current week." });
      return;
    }
    this.attempt = { ...parsed.value };
    await this.send();
  };
  private async send() {
    if (this.disposed || !this.attempt) return;
    this.publish({ busy: true, pendingWrite: true, notice: null });
    try {
      const receipt = await this.run(this.client.remove(this.attempt));
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
        notice: "Verify your account before removing meals.",
      });
    } else if (this.view.stage === "verify") {
      this.publish({ notice: "Your account could not be verified. Try again online." });
    } else if (this.view.receipt) {
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "Your meal was removed, but the week could not refresh. Reload the week; do not remove it again.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "The week changed or this meal could not be removed. Reload and check the meal before trying again.",
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
