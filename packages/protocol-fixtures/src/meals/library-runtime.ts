import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { MealLibraryPage } from "@nest/contracts/meal-library";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealLibraryClient } from "./library-client.ts";
export interface LibraryView {
  meals: MealLibraryPage["meals"];
  revision: string | null;
  nextAfterId: string | null;
  busy: boolean;
  fresh: boolean;
  access: "ready" | "verify";
  notice: string | null;
}
export class MealLibraryRuntime {
  private view: LibraryView = {
    meals: [],
    revision: null,
    nextAfterId: null,
    busy: false,
    fresh: false,
    access: "ready",
    notice: null,
  };
  private active: AbortController | null = null;
  private disposed = false;
  private listeners = new Set<() => void>();
  private readonly client: MealLibraryClient;
  constructor(client: MealLibraryClient) {
    this.client = client;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(patch: Partial<LibraryView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  load() {
    return this.read(false);
  }
  more() {
    if (this.view.busy || !this.view.fresh || !this.view.nextAfterId) return Promise.resolve();
    return this.read(true);
  }
  private async read(more: boolean) {
    if (this.disposed) return;
    this.active?.abort();
    const attempt = new AbortController();
    this.active = attempt;
    const previous = this.view;
    const current = () => !this.disposed && this.active === attempt;
    this.publish({ busy: true, fresh: false, notice: null });
    try {
      const page = await Effect.runPromise(
        this.client.read(more ? previous.nextAfterId : null, more ? previous.revision : null),
        { signal: attempt.signal },
      );
      if (!current()) return;
      this.publish({
        meals: more ? [...previous.meals, ...page.meals] : page.meals,
        revision: page.revision,
        nextAfterId: page.nextAfterId,
        access: "ready",
        fresh: true,
      });
    } catch (error) {
      if (current()) this.failure(error);
    } finally {
      if (current()) this.publish({ busy: false });
    }
  }
  private failure(error: unknown) {
    if (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code)) {
      this.publish({
        meals: [],
        revision: null,
        nextAfterId: null,
        access: "verify",
        notice: "Verify your account before viewing saved recipes.",
      });
    } else if (Schema.is(PreferenceFailure)(error) && error.code === "conflict") {
      this.publish({
        meals: [],
        revision: null,
        nextAfterId: null,
        notice: "The recipe library changed. Reload to see the current recipes.",
      });
    } else
      this.publish({
        notice:
          this.view.revision === null
            ? "Could not load saved recipes. Connect and try again."
            : "Could not refresh. These recipes may have changed; reload before opening one.",
      });
  }
  cancel() {
    this.active?.abort();
    this.active = null;
    this.publish({ busy: false, fresh: false });
  }
  dispose() {
    this.disposed = true;
    this.active?.abort();
    this.listeners.clear();
  }
}
