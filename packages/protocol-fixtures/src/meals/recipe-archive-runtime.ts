import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ArchiveRecipe, type RecipeArchiveReceipt } from "@nest/contracts/recipe-archive";
import { PreferenceFailure } from "../preferences/client.ts";
import type { ReadSavedMeal, SavedMealEnvelope } from "@nest/contracts/meal-library";
import type { MealClient } from "./client.ts";
export type RecipeArchiveView = {
  snapshot: SavedMealEnvelope | null;
  busy: boolean;
  pendingWrite: boolean;
  stage: "ready" | "uncertain" | "reload" | "verify" | "saved";
  notice: string | null;
  receipt: typeof RecipeArchiveReceipt.Type | null;
};
export class RecipeArchiveRuntime {
  private view: RecipeArchiveView = {
    snapshot: null,
    busy: false,
    pendingWrite: false,
    stage: "ready",
    notice: null,
    receipt: null,
  };
  private attempt: typeof ArchiveRecipe.Type | null = null;
  private disposed = false;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  private client: Pick<MealClient, "library" | "archiveRecipe">;
  readonly target: Readonly<typeof ReadSavedMeal.Type>;
  private uuid: () => string;
  constructor(
    client: Pick<MealClient, "library" | "archiveRecipe">,
    target: typeof ReadSavedMeal.Type,
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
  private publish(patch: Partial<RecipeArchiveView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private async read(refresh: boolean) {
    const client = this.client,
      target = this.target;
    const snapshot = await this.run(
      Effect.gen(function* () {
        const revision = refresh
          ? (yield* client.library.read()).revision
          : target.expectedRevision;
        return yield* client.library.recipe(target.definitionId, revision);
      }),
    );
    if (this.disposed) return;
    if (this.view.receipt && BigInt(snapshot.revision) < BigInt(this.view.receipt.revision))
      throw new PreferenceFailure({ code: "unavailable" });
    this.attempt = null;
    this.publish({
      snapshot,
      stage: this.view.receipt ? "saved" : "ready",
      notice: this.view.receipt
        ? "The archive was confirmed. This recipe now reflects the current household library."
        : null,
    });
  }
  load = async (refresh = false) => {
    if (this.disposed || this.view.busy || (this.attempt && !this.view.receipt)) return;
    this.publish({ busy: true });
    try {
      await this.read(refresh || !!this.view.receipt);
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  };
  save = async () => {
    if (
      this.disposed ||
      this.view.busy ||
      this.view.stage !== "ready" ||
      !this.view.snapshot?.recipe
    )
      return;
    const parsed = Schema.decodeUnknownExit(ArchiveRecipe)(
      {
        operationId: this.uuid(),
        definitionId: this.target.definitionId,
        expectedRevision: this.view.snapshot.revision,
      },
      { onExcessProperty: "error" },
    );
    if (parsed._tag === "Failure") {
      this.publish({ notice: "This recipe cannot be archived at its current revision." });
      return;
    }
    this.attempt = { ...parsed.value };
    await this.send();
  };
  private async send() {
    if (this.disposed || !this.attempt) return;
    this.publish({ busy: true, pendingWrite: true, notice: null });
    try {
      const receipt = await this.run(this.client.archiveRecipe(this.attempt));
      if (this.disposed) return;
      this.publish({ receipt, pendingWrite: false });
      await this.read(true);
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
        notice: "Verify your account before archiving recipes.",
      });
    } else if (this.view.stage === "verify") {
      this.publish({ notice: "Your account could not be verified. Try again online." });
    } else if (this.view.receipt) {
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "The archive was confirmed, but the library could not refresh. Reload; do not archive again.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        snapshot: null,
        stage: "reload",
        pendingWrite: false,
        notice:
          "The library changed or the recipe could not be archived. Reload and check the current recipe before confirming again.",
      });
    } else this.unavailable();
  }
  private unavailable() {
    this.publish({
      stage: this.attempt ? "uncertain" : "reload",
      notice: this.attempt
        ? "Archiving could not be confirmed. Retry this exact request before making another change."
        : "Could not load the library. Connect and try again.",
    });
  }
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.attempt = null;
    this.listeners.clear();
  }
}
