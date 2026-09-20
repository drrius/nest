import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { Chore } from "@nest/contracts/chores";
import { SkipChore, RescheduleChore } from "@nest/contracts/routines";
import type { ChoreFlow } from "./flow.ts";
import type { ChoreView } from "./runtime.ts";

type Attempt = typeof SkipChore.Type | typeof RescheduleChore.Type;
type Ports = {
  flow: ChoreFlow;
  run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
  view: () => ChoreView;
  emit: (patch: Partial<ChoreView>) => void;
  refresh: () => Promise<void>;
  blocked: () => boolean;
};

// Online attempts live only for this controller's lifetime. They never enter the outbox.
export class ChoreChangeRuntime {
  private attempt: Attempt | null = null;
  private readonly ports: Ports;
  constructor(ports: Ports) {
    this.ports = ports;
  }
  refresh = async () => {
    if (this.attempt || this.ports.blocked()) return;
    await this.ports.refresh();
    const view = this.ports.view();
    if (!view.stale && view.access === "allowed") this.ports.emit({ changeStage: "ready" });
  };
  private eligible(chore: Chore) {
    const view = this.ports.view();
    if (view.syncing || view.stale || view.access !== "allowed" || view.changeStage !== "ready")
      return false;
    const row = view.data?.chores.find((item) => item.occurrenceId === chore.occurrenceId);
    return row !== undefined && !row.done && !row.pending && row.dueDate === chore.dueDate;
  }
  begin = async (chore: Chore, operation: string, newDueDate?: string) => {
    if (this.ports.blocked() || this.attempt || this.ports.view().changeStage !== "ready") return;
    if (!this.eligible(chore)) {
      this.ports.emit({
        changed: this.ports.view().changed + 1,
        changeStage: "reload",
        changeNotice: "Reload this chore before changing it. Saved completions must sync first.",
      });
      return;
    }
    const input = {
      operationId: operation,
      occurrenceId: chore.occurrenceId,
      expectedDueDate: chore.dueDate,
      ...(newDueDate === undefined ? {} : { newDueDate }),
    };
    const decoded = Schema.decodeUnknownExit(
      newDueDate === undefined ? SkipChore : RescheduleChore,
    )(input, { onExcessProperty: "error" });
    if (decoded._tag === "Failure") {
      this.ports.emit({ changeNotice: "Choose a different valid due date before saving." });
      return;
    }
    this.attempt = { ...decoded.value };
    await this.send();
  };
  private failed(error: unknown) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "session" || code === "forbidden") {
      this.attempt = null;
      this.ports.emit({
        changed: this.ports.view().changed + 1,
        data: null,
        access: "verify",
        pendingWrite: false,
        changeStage: "reload",
        error: "Verify your account before changing chores.",
        changeNotice: null,
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.ports.emit({
        changed: this.ports.view().changed + 1,
        pendingWrite: false,
        changeStage: "reload",
        changeNotice: "This chore could not be changed. Reload and check its current details.",
      });
    } else {
      this.ports.emit({
        changeStage: "uncertain",
        changeNotice:
          "This change may have saved. Retry the exact request before changing chores again.",
      });
    }
  }
  private async send() {
    const attempt = this.attempt;
    if (!attempt || this.ports.blocked()) return;
    this.ports.emit({ changeStage: "saving", pendingWrite: true, changeNotice: null });
    try {
      const receipt = await this.ports.run(
        "newDueDate" in attempt
          ? this.ports.flow.reschedule(attempt)
          : this.ports.flow.skip(attempt),
      );
      this.attempt = null;
      this.ports.emit({
        pendingWrite: false,
        changeStage: "reload",
        changed: this.ports.view().changed + 1,
        changeNotice: receipt.action === "skip" ? "Chore skipped." : "Chore rescheduled.",
      });
      await this.refresh();
    } catch (error) {
      this.failed(error);
    }
  }
  retry = async () => {
    if (this.ports.view().changeStage === "uncertain") await this.send();
  };
  dispose() {
    this.attempt = null;
  }
}
