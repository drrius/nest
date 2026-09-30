import type { mealLeftoversClient } from "./leftovers-client.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PlaceLeftovers, type LeftoverPlacementReceipt } from "@nest/contracts/meal-leftovers";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealClient } from "./client.ts";
export type LeftoversTarget = Readonly<Pick<PlaceLeftovers, "sourceWeekStart" | "entryId">>;
export type LeftoversView = {
  source: MealWeekSnapshot | null;
  destination: MealWeekSnapshot | null;
  targetWeekStart: string;
  busy: boolean;
  pendingWrite: boolean;
  stage: "ready" | "uncertain" | "reload" | "verify" | "saved";
  notice: string | null;
  receipt: LeftoverPlacementReceipt | null;
};
const initial: LeftoversView = {
  source: null,
  destination: null,
  targetWeekStart: "",
  busy: false,
  pendingWrite: false,
  stage: "ready",
  notice: null,
  receipt: null,
};
export class MealLeftoversRuntime {
  private view = initial;
  private attempt: PlaceLeftovers | null = null;
  private confirmed: LeftoverPlacementReceipt | null = null;
  private disposed = false;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  private client: Pick<MealClient, "read"> & {
    placeLeftovers: ReturnType<typeof mealLeftoversClient>;
  };
  readonly target: LeftoversTarget;
  private uuid: () => string;
  constructor(
    client: Pick<MealClient, "read"> & { placeLeftovers: ReturnType<typeof mealLeftoversClient> },
    target: LeftoversTarget,
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
  private publish(patch: Partial<LeftoversView>) {
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
    const receipt = this.confirmed;
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
      receipt,
      stage: receipt ? "saved" : "ready",
      notice: receipt ? "Leftovers confirmed. These weeks show the current household plan." : null,
    });
  }
  selectWeek = async (targetWeekStart: string) => {
    if (
      this.disposed ||
      this.view.busy ||
      this.attempt ||
      this.confirmed ||
      this.view.stage === "verify"
    )
      return;
    this.publish({ targetWeekStart, destination: null, stage: "reload" });
    await this.load();
  };
  load = async () => {
    if (this.disposed || this.view.busy || (this.attempt && !this.confirmed)) return;
    this.publish({ busy: true });
    try {
      await this.read();
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  };
  save = async (destination: Pick<PlaceLeftovers, "date" | "slot">) => {
    const { source, destination: week } = this.view;
    if (!this.canSave() || !source || !week) return;
    const meal = source.entries.find(
      (entry) => entry.entryId === this.target.entryId.toLowerCase(),
    );
    if (!meal) {
      this.publish({
        notice: "This meal is no longer in its original week. Return to the current plan.",
      });
      return;
    }
    const choice = Schema.decodeUnknownExit(
      Schema.Struct({
        date: PlaceLeftovers.fields.date,
        slot: PlaceLeftovers.fields.slot,
      }),
    )(destination, { onExcessProperty: "error" });
    if (choice._tag === "Failure" || meal.leftoverSourceId || choice.value.date <= meal.date) {
      this.publish({ notice: "Choose a later day for leftovers from an original meal." });
      return;
    }
    if (
      week.entries.some(
        (entry) => entry.date === destination.date && entry.slot === destination.slot,
      )
    ) {
      this.publish({ notice: "Choose an empty meal slot. Leftovers do not replace another meal." });
      return;
    }
    const parsed = Schema.decodeUnknownExit(PlaceLeftovers)(
      {
        operationId: this.uuid(),
        ...this.target,
        ...choice.value,
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
  private canSave() {
    return !this.disposed && !this.view.busy && this.view.stage === "ready" && !this.confirmed;
  }
  private async send() {
    if (this.disposed || !this.attempt) return;
    this.publish({ busy: true, pendingWrite: true, notice: null });
    try {
      const receipt = await this.run(this.client.placeLeftovers(this.attempt));
      if (this.disposed) return;
      this.confirmed = receipt;
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
        notice: "Verify your account before planning leftovers.",
      });
    } else if (this.view.stage === "verify") {
      this.publish({ notice: "Your account could not be verified. Try again online." });
    } else if (this.confirmed) {
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "Leftovers were saved, but the weeks could not refresh. Reload without saving again.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "A week changed or these leftovers could not be saved. Reload both weeks and choose a destination again.",
      });
    } else this.unavailable();
  }
  private unavailable() {
    this.publish({
      stage: this.attempt ? "uncertain" : "reload",
      notice: this.attempt
        ? "Your leftovers could not be confirmed. Retry this exact request before making another change."
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
