import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { PreferenceFailure } from "./client.ts";
import type { PreferenceClient, PreferenceCommand, PreferenceView } from "./contracts.ts";
const initial: PreferenceView<never> = {
  profile: null,
  loaded: false,
  busy: false,
  stage: "form",
  notice: null,
  generation: 0,
};
export class PreferenceRuntime<P> {
  private view: PreferenceView<P> = initial;
  private attempt: PreferenceCommand<P> | null = null;
  private acknowledged: string | null = null;
  private disposed = false;
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly client: PreferenceClient<P>;
  private readonly uuid: () => string;
  private readonly schema: Schema.Codec<PreferenceCommand<P>>;
  private readonly copy: (preferences: P) => P;
  constructor(
    client: PreferenceClient<P>,
    uuid: () => string,
    schema: Schema.Codec<PreferenceCommand<P>>,
    copy: (preferences: P) => P,
  ) {
    this.schema = schema;
    this.copy = copy;
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
  private publish(patch: Partial<PreferenceView<P>>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private failed(error: unknown) {
    if (this.disposed) return;
    const code = Schema.is(PreferenceFailure)(error) ? error.code : "unavailable";
    if (code === "session" || code === "forbidden") {
      this.attempt = null;
      this.acknowledged = null;
      this.publish({
        profile: null,
        loaded: false,
        stage: "verify",
        notice: "Verify your account before opening preferences.",
      });
    } else if (this.acknowledged) {
      this.publish({
        stage: "reload",
        notice:
          "Your save was confirmed. Reload to see the current preferences before editing again.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        stage: "conflict",
        notice:
          "These preferences could not be saved. Reload the current version before making changes.",
      });
    } else {
      this.publish({
        stage: this.attempt ? "uncertain" : this.view.stage,
        notice: this.attempt
          ? "The save could not be confirmed. Retry this exact save before editing again."
          : "Could not load your preferences. Try again online.",
      });
    }
  }
  private async read() {
    const profile = await this.run(this.client.read());
    if (this.disposed) return;
    if (this.acknowledged && (!profile || BigInt(profile.revision) < BigInt(this.acknowledged)))
      throw new PreferenceFailure({ code: "unavailable" });
    const saved = this.acknowledged !== null;
    this.attempt = null;
    this.acknowledged = null;
    this.publish({
      profile,
      loaded: true,
      stage: "form",
      generation: this.view.generation + 1,
      notice: saved ? "Saved. These are your current preferences." : null,
    });
  }
  load = async () => {
    if (this.disposed || this.view.busy || (this.attempt && !this.acknowledged)) return;
    this.publish({ busy: true });
    try {
      await this.read();
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  };
  save = async (preferences: P) => {
    if (this.disposed || this.view.busy || !this.view.loaded || this.view.stage !== "form") return;
    const decoded = Schema.decodeUnknownExit(this.schema)({
      operationId: this.uuid(),
      expectedRevision: this.view.profile?.revision ?? "0",
      preferences,
    });
    if (decoded._tag === "Failure") {
      this.publish({ notice: "Check your preferences before saving." });
      return;
    }
    // Snapshot the payload: mutable native input must never change an exact retry.
    this.attempt = {
      ...decoded.value,
      preferences: this.copy(decoded.value.preferences),
    };
    await this.send();
  };
  private async send() {
    if (!this.attempt || this.disposed) return;
    this.publish({ busy: true, notice: null });
    try {
      const receipt = await this.run(this.client.save(this.attempt));
      if (this.disposed) return;
      this.acknowledged = receipt.revision;
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
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.attempt = null;
    this.acknowledged = null;
    this.view = initial;
    this.listeners.clear();
  }
}
