import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CreateRecipe, type RecipeCreationReceipt } from "@nest/contracts/recipe-creation";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealClient } from "./client.ts";
export type RecipeCreationView = {
  revision: string | null;
  busy: boolean;
  pendingWrite: boolean;
  stage: "ready" | "uncertain" | "reload" | "verify" | "saved";
  notice: string | null;
  receipt: typeof RecipeCreationReceipt.Type | null;
};
export class RecipeCreationRuntime {
  private view: RecipeCreationView = {
    revision: null,
    busy: false,
    pendingWrite: false,
    stage: "ready",
    notice: null,
    receipt: null,
  };
  private attempt: typeof CreateRecipe.Type | null = null;
  private disposed = false;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  private client: Pick<MealClient, "library" | "createRecipe">;
  private uuid: () => string;
  constructor(client: Pick<MealClient, "library" | "createRecipe">, uuid: () => string) {
    this.client = client;
    this.uuid = uuid;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<RecipeCreationView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private async read() {
    const page = await this.run(this.client.library.read());
    if (this.disposed) return;
    if (this.view.receipt && BigInt(page.revision) < BigInt(this.view.receipt.revision))
      throw new PreferenceFailure({ code: "unavailable" });
    this.attempt = null;
    this.publish({
      revision: page.revision,
      stage: this.view.receipt ? "saved" : "ready",
      notice: this.view.receipt
        ? "Your recipe was saved. The library may include later household changes."
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
  save = async (recipe: unknown) => {
    if (
      this.disposed ||
      this.view.busy ||
      this.view.stage !== "ready" ||
      this.view.revision === null
    )
      return;
    const parsed = Schema.decodeUnknownExit(CreateRecipe)(
      { operationId: this.uuid(), expectedRevision: this.view.revision, recipe },
      { onExcessProperty: "error" },
    );
    if (parsed._tag === "Failure") {
      this.publish({
        notice: "Check the recipe title, servings, instructions and ingredients before saving.",
      });
      return;
    }
    this.attempt = {
      ...parsed.value,
      recipe: {
        ...parsed.value.recipe,
        ingredients: parsed.value.recipe.ingredients.map((ingredient) => ({ ...ingredient })),
      },
    };
    await this.send();
  };
  private async send() {
    if (this.disposed || !this.attempt) return;
    this.publish({ busy: true, pendingWrite: true, notice: null });
    try {
      const receipt = await this.run(this.client.createRecipe(this.attempt));
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
        revision: null,
        receipt: null,
        stage: "verify",
        pendingWrite: false,
        notice: "Verify your account before saving recipes.",
      });
    } else if (this.view.stage === "verify") {
      this.publish({ notice: "Your account could not be verified. Try again online." });
    } else if (this.view.receipt) {
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "Your recipe was saved, but the library could not refresh. Reload; do not save it again.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        revision: null,
        stage: "reload",
        pendingWrite: false,
        notice:
          "The library changed or the recipe could not be saved. Reload and check your draft before trying again.",
      });
    } else this.unavailable();
  }
  private unavailable() {
    this.publish({
      stage: this.attempt ? "uncertain" : "reload",
      notice: this.attempt
        ? "Saving could not be confirmed. Retry this exact request before making another change."
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
