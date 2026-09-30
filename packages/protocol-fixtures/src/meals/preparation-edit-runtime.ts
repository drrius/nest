import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  EditMealPreparation,
  type MealPreparationEditReceipt,
} from "@nest/contracts/meal-preparation-edit";
import type { MealPreparationEnvelope } from "@nest/contracts/meal-preparation-read";
import type { MealClient } from "./client.ts";
import type { RoutineClient, RoutineSnapshot } from "../routines/client.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { PreparationTarget } from "./preparation-runtime.ts";
type Dependencies = {
  meals: Pick<MealClient, "read" | "readPreparation" | "editPreparation">;
  routines: Pick<RoutineClient, "roster">;
};
export type PreparationEditView = {
  generation: number;
  snapshot: MealPreparationEnvelope | null;
  members: RoutineSnapshot["members"];
  busy: boolean;
  pendingWrite: boolean;
  stage: "ready" | "reload" | "uncertain" | "verify" | "saved";
  notice: string | null;
  receipt: MealPreparationEditReceipt | null;
};
export class MealPreparationEditRuntime {
  private view: PreparationEditView = {
    generation: 0,
    snapshot: null,
    members: [],
    busy: false,
    pendingWrite: false,
    stage: "ready",
    notice: null,
    receipt: null,
  };
  private attempt: EditMealPreparation | null = null;
  private confirmed: MealPreparationEditReceipt | null = null;
  private disposed = false;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  private client: Dependencies;
  private uuid: () => string;
  readonly target: PreparationTarget;
  constructor(client: Dependencies, target: PreparationTarget, uuid: () => string) {
    this.client = client;
    this.target = Object.freeze({ ...target, entryId: target.entryId.toLowerCase() });
    this.uuid = uuid;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<PreparationEditView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private async read() {
    const week = await this.run(this.client.meals.read(this.target.weekStart));
    const snapshot = await this.run(
      this.client.meals.readPreparation({ ...this.target, revision: week.revision }),
    );
    const { members } = await this.run(this.client.routines.roster());
    if (this.disposed) return;
    if (!this.containsConfirmation(snapshot)) throw new PreferenceFailure({ code: "unavailable" });
    this.attempt = null;
    this.publish({
      snapshot,
      generation: this.view.generation + 1,
      members,
      receipt: this.confirmed,
      stage: this.confirmed ? "saved" : "ready",
      notice: this.confirmed
        ? "Preparation edit was saved. These details show the current household task."
        : null,
    });
  }
  private containsConfirmation(snapshot: MealPreparationEnvelope) {
    const receipt = this.confirmed;
    if (!receipt) return true;
    if (BigInt(snapshot.revision) < BigInt(receipt.revision)) return false;
    if (!snapshot.entry) return true;
    return (
      snapshot.preparation !== null &&
      snapshot.preparation.routineId === receipt.routineId &&
      snapshot.preparation.routineVersion >= receipt.routineVersion
    );
  }
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
  save = async (patch: unknown) => {
    if (!this.canSave()) return;
    const snapshot = this.view.snapshot!;
    const preparation = snapshot.preparation!;
    const parsed = Schema.decodeUnknownExit(EditMealPreparation)(
      {
        ...this.target,
        operationId: this.uuid(),
        expectedRevision: snapshot.revision,
        routineId: preparation.routineId,
        expectedRoutineVersion: preparation.routineVersion,
        patch,
      },
      { onExcessProperty: "error" },
    );
    if (parsed._tag === "Failure") {
      this.publish({ notice: "Check the title, instructions, date and responsibility." });
      return;
    }
    const assignment = parsed.value.patch.assignment;
    const member =
      assignment?.policy === "assigned"
        ? assignment.memberId
        : assignment?.policy === "alternating"
          ? assignment.anchorMemberId
          : null;
    if (member && !this.view.members.some((item) => item.actorId === member.toLowerCase())) {
      this.publish({ notice: "Choose a current household member." });
      return;
    }
    this.attempt = {
      ...parsed.value,
      patch: { ...parsed.value.patch, ...(assignment ? { assignment: { ...assignment } } : {}) },
    };
    await this.send();
  };
  private canSave() {
    return (
      !this.disposed &&
      !this.view.busy &&
      this.view.stage === "ready" &&
      !this.confirmed &&
      this.view.snapshot?.entry !== null &&
      !!this.view.snapshot &&
      !!this.view.snapshot.preparation &&
      this.view.snapshot.preparation.state !== "archived"
    );
  }
  private async send() {
    if (this.disposed || !this.attempt) return;
    this.publish({ busy: true, pendingWrite: true, notice: null });
    try {
      const receipt = await this.run(this.client.meals.editPreparation(this.attempt));
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
        snapshot: null,
        members: [],
        receipt: null,
        stage: "verify",
        pendingWrite: false,
        notice: "Verify your account before viewing meal preparation.",
      });
    } else if (this.view.stage === "verify") {
      this.publish({ notice: "Your account could not be verified. Try again online." });
    } else if (this.confirmed) {
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "Preparation edit was saved, but its details could not refresh. Reload without sending it again.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        stage: "reload",
        pendingWrite: false,
        notice:
          "The meal or task changed. Reload and check the current details before trying again.",
      });
    } else this.unavailable();
  }
  private unavailable() {
    this.publish({
      stage: this.attempt ? "uncertain" : "reload",
      notice: this.attempt
        ? "This edit is unconfirmed. Retry this exact request before another change."
        : "Could not load preparation. Connect and try again.",
    });
  }
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.attempt = null;
    this.listeners.clear();
  }
}
