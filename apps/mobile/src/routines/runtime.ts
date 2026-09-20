import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CreateRoutine,
  EditRoutine,
  RoutineStateCommand,
  type Routine,
  type RoutinePatch,
  type RoutineDefinition,
} from "@nest/contracts/routines";
import { PreferenceFailure } from "../preferences/client.ts";
import type { RoutineClient, RoutineSnapshot } from "./client.ts";
export type RoutineView = {
  snapshot: RoutineSnapshot | null;
  busy: boolean;
  stage: "ready" | "uncertain" | "reload" | "verify";
  notice: string | null;
  created: string | null;
  saved: number;
};
const initial: RoutineView = {
  snapshot: null,
  busy: false,
  stage: "ready",
  notice: null,
  created: null,
  saved: 0,
};
export class RoutineRuntime {
  private view = initial;
  private attempt: CreateRoutine | EditRoutine | typeof RoutineStateCommand.Type | null = null;
  private acknowledged: string | null = null;
  private disposed = false;
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly client: RoutineClient;
  private readonly uuid: () => string;
  constructor(client: RoutineClient, uuid: () => string) {
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
  private publish(patch: Partial<RoutineView>) {
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
        snapshot: null,
        stage: "verify",
        created: null,
        notice: "Verify your account to open routines.",
      });
    } else if (this.view.stage === "verify") {
      this.publish({ notice: "Your account could not be verified. Try again online." });
    } else if (this.acknowledged) {
      this.publish({
        stage: "reload",
        notice:
          "Your change was confirmed. Reload the current routines before making another change.",
      });
    } else if (code === "invalid" || code === "conflict") {
      this.attempt = null;
      this.publish({
        stage: "reload",
        notice:
          "The routine could not be saved. Reload and check its current details before trying again.",
      });
    } else {
      this.unavailable();
    }
  }
  private unavailable() {
    this.publish({
      stage: this.attempt ? "uncertain" : this.view.stage,
      notice: this.attempt
        ? "Your change could not be confirmed. Retry this exact request before making another change."
        : "Could not load routines. Try again online.",
    });
  }
  private async read() {
    const snapshot = await this.run(this.client.read());
    if (this.disposed) return;
    const created = this.acknowledged;
    this.attempt = null;
    this.acknowledged = null;
    this.publish({
      snapshot,
      stage: "ready",
      created: created ?? this.view.created,
      saved: this.view.saved + (created ? 1 : 0),
      notice: created ? "Saved. This list shows the current household routines." : null,
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
  create = async (definition: RoutineDefinition) => {
    if (this.disposed || this.view.busy || !this.view.snapshot || this.view.stage !== "ready")
      return;
    const decoded = Schema.decodeUnknownExit(CreateRoutine)({
      operationId: this.uuid(),
      definition,
    });
    if (decoded._tag === "Failure") {
      this.publish({ notice: "Check the title, schedule and responsibility before creating." });
      return;
    }
    const value = decoded.value.definition;
    this.attempt = {
      ...decoded.value,
      definition: {
        ...value,
        assignment: { ...value.assignment },
        schedule:
          value.schedule.kind === "weekdays"
            ? { ...value.schedule, days: [...value.schedule.days] }
            : { ...value.schedule },
      },
    };
    await this.send();
  };
  edit = async (routine: Routine, patch: RoutinePatch) => {
    if (this.disposed || this.view.busy || !this.view.snapshot || this.view.stage !== "ready")
      return;
    const decoded = Schema.decodeUnknownExit(EditRoutine)(
      {
        operationId: this.uuid(),
        routineId: routine.routineId,
        expectedVersion: routine.version,
        patch,
      },
      { onExcessProperty: "error" },
    );
    if (decoded._tag === "Failure") {
      this.publish({ notice: "Check the requested changes before saving." });
      return;
    }
    const value = decoded.value.patch;
    this.attempt = {
      ...decoded.value,
      patch: {
        ...value,
        ...(value.assignment ? { assignment: { ...value.assignment } } : {}),
        ...(value.schedule
          ? {
              schedule:
                value.schedule.kind === "weekdays"
                  ? { ...value.schedule, days: [...value.schedule.days] }
                  : { ...value.schedule },
            }
          : {}),
      },
    };
    await this.send();
  };
  setState = async (routine: Routine, action: typeof RoutineStateCommand.Type.action) => {
    if (this.disposed || this.view.busy || !this.view.snapshot || this.view.stage !== "ready")
      return;
    const decoded = Schema.decodeUnknownExit(RoutineStateCommand)(
      {
        operationId: this.uuid(),
        routineId: routine.routineId,
        expectedVersion: routine.version,
        action,
      },
      { onExcessProperty: "error" },
    );
    if (decoded._tag === "Failure") {
      this.publish({ notice: "Reload the routine before changing its state." });
      return;
    }
    this.attempt = decoded.value;
    await this.send();
  };
  private async send() {
    if (this.disposed || !this.attempt) return;
    this.publish({ busy: true, notice: null });
    try {
      const receipt = await this.run(
        "action" in this.attempt
          ? this.client.setState(this.attempt)
          : "patch" in this.attempt
            ? this.client.edit(this.attempt)
            : this.client.create(this.attempt),
      );
      if (this.disposed) return;
      this.acknowledged = receipt.routineId;
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
