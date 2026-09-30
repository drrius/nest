import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { EditRecipe, type RecipeEditReceipt } from "@nest/contracts/recipe-edit";
import { PreferenceFailure } from "../preferences/client.ts";
import type { ReadSavedMeal, SavedMealEnvelope } from "@nest/contracts/meal-library";
import type { MealClient } from "./client.ts";
import type { recipeEditClient } from "./recipe-edit-client.ts";
const Changes = Schema.Struct({
  patch: EditRecipe.fields.patch,
  ingredients: EditRecipe.fields.ingredients,
});
export type RecipeEditView = {
  snapshot: SavedMealEnvelope | null;
  generation: number;
  busy: boolean;
  pendingWrite: boolean;
  stage: "ready" | "uncertain" | "reload" | "verify" | "saved";
  notice: string | null;
  receipt: RecipeEditReceipt | null;
};
export type EditClient = Pick<MealClient, "library"> & {
  editRecipe: ReturnType<typeof recipeEditClient>;
};
export class RecipeEditRuntime {
  private view: RecipeEditView = {
    snapshot: null,
    generation: 0,
    busy: false,
    pendingWrite: false,
    stage: "ready",
    notice: null,
    receipt: null,
  };
  private attempt: EditRecipe | null = null;
  private disposed = false;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  private client: EditClient;
  readonly target: Readonly<typeof ReadSavedMeal.Type>;
  private uuid: () => string;
  constructor(client: EditClient, target: typeof ReadSavedMeal.Type, uuid: () => string) {
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
  private publish(patch: Partial<RecipeEditView>) {
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
      generation: this.view.generation + 1,
      stage: this.view.receipt ? "saved" : "ready",
      notice: this.view.receipt
        ? "Your edit was confirmed. The recipe now reflects the current household library."
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
  save = async (changes: unknown) => {
    if (
      this.disposed ||
      this.view.busy ||
      this.view.stage !== "ready" ||
      !this.view.snapshot?.recipe
    )
      return;
    const draft = Schema.decodeUnknownExit(Changes)(changes, { onExcessProperty: "error" });
    if (draft._tag === "Failure") {
      this.invalid();
      return;
    }
    const parsed = Schema.decodeUnknownExit(EditRecipe)(
      {
        ...draft.value,
        operationId: this.uuid(),
        definitionId: this.target.definitionId,
        expectedRevision: this.view.snapshot.revision,
      },
      { onExcessProperty: "error" },
    );
    if (parsed._tag === "Failure") {
      this.invalid();
      return;
    }
    const value = parsed.value;
    this.attempt = {
      ...value,
      patch: { ...value.patch },
      ingredients:
        value.ingredients?.map((item) =>
          item.kind === "existing" ? { ...item, patch: { ...item.patch } } : { ...item },
        ) ?? null,
    };
    await this.send();
  };
  private invalid() {
    this.publish({ notice: "Change at least one field and check the values before saving." });
  }
  private async send() {
    if (this.disposed || !this.attempt) return;
    this.publish({ busy: true, pendingWrite: true, notice: null });
    try {
      const receipt = await this.run(this.client.editRecipe(this.attempt));
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
        notice: "Verify your account before editing recipes.",
      });
    } else if (this.view.stage === "verify") {
      this.publish({ notice: "Your account could not be verified. Try again online." });
    } else if (this.view.receipt) {
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "Your edit was confirmed, but the library could not refresh. Reload; do not save it again.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "The recipe changed or could not be saved. Your draft is shown for reference. Reload the current recipe before making a new edit.",
      });
    } else this.unavailable();
  }
  private unavailable() {
    this.publish({
      stage: this.attempt ? "uncertain" : "reload",
      notice: this.attempt
        ? "Saving could not be confirmed. Retry this exact edit before making another change."
        : "Could not load the recipe. Connect and try again.",
    });
  }

  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.attempt = null;
    this.listeners.clear();
  }
}
