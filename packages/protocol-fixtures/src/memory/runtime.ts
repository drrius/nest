import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MemoryContent, type Memory } from "@nest/contracts/memory";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MemoryClient } from "./client.ts";
import {
  initialMemoryView,
  approvalCanSave,
  type MemoryView,
  type MemoryAttempt,
} from "./state.ts";
export class MemoryRuntime {
  private view: MemoryView = initialMemoryView;
  private attempt: MemoryAttempt | null = null;
  private acknowledged = false;
  private disposed = false;
  private readonly lifetime = new AbortController();
  private readonly listeners = new Set<() => void>();
  private readonly client: MemoryClient;
  private readonly uuid: () => string;
  private approvalId: string | null;
  constructor(client: MemoryClient, uuid: () => string, approvalId: string | null = null) {
    this.client = client;
    this.uuid = uuid;
    this.approvalId = approvalId;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<MemoryView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private editable() {
    return !this.disposed && !this.view.busy && this.view.loaded && this.view.stage === "ready";
  }
  private failed(error: unknown) {
    if (this.disposed) return;
    const code = Schema.is(PreferenceFailure)(error) ? error.code : "unavailable";
    if (code === "session" || code === "forbidden") {
      this.attempt = null;
      this.acknowledged = false;
      this.approvalId = null;
      this.publish({
        items: [],
        approval: null,
        loaded: false,
        generation: this.view.generation + 1,
        stage: "verify",
        notice: "Verify your account before opening private memory.",
      });
    } else if (this.acknowledged) {
      this.publish({
        stage: "reload",
        notice:
          "Your action was confirmed. Reload the current saved memory before making more changes.",
      });
    } else if (code === "conflict" || code === "invalid") {
      this.attempt = null;
      this.publish({
        stage: "conflict",
        notice:
          "Memory or approval changed, expired, or reached its limit. Reload before making changes.",
      });
    } else {
      this.publish({
        stage: this.attempt ? "uncertain" : this.view.stage,
        notice: this.attempt
          ? "The outcome is unknown. Retry this exact request before making changes."
          : "Could not load private memory. Try again online.",
      });
    }
  }
  private async read() {
    const items = await this.run(this.client.list());
    if (this.disposed) return;
    const approval = this.approvalId ? await this.run(this.client.approval(this.approvalId)) : null;
    if (this.disposed) return;
    const confirmed = this.acknowledged;
    this.attempt = null;
    this.acknowledged = false;
    this.publish({
      items,
      approval,
      loaded: true,
      stage: "ready",
      generation: this.view.generation + 1,
      notice: confirmed ? "Confirmed. This is your current saved memory." : null,
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
  propose = async (content: string, memory?: Memory) => {
    if (!this.editable() || this.view.approval) return;
    if (!Schema.is(MemoryContent)(content)) {
      this.publish({ notice: "Enter memory text of up to 1,000 characters." });
      return;
    }
    this.attempt = {
      kind: "propose",
      input: {
        operationId: this.uuid(),
        memoryId: memory?.id ?? this.uuid(),
        expectedRevision: memory?.revision ?? "0",
        content,
      },
    };
    await this.send();
  };
  decide = async (approved: boolean) => {
    const approval = this.view.approval;
    if (!this.editable() || !approval || (approved && !approvalCanSave(this.view))) return;
    this.attempt = {
      kind: "decide",
      input: {
        ...approval.change,
        operationId: approval.operationId,
        approvalId: approval.id,
        approved,
      },
    };
    await this.send();
  };
  remove = async (memory: Memory) => {
    if (!this.editable() || this.view.approval) return;
    this.attempt = {
      kind: "remove",
      input: { operationId: this.uuid(), memoryId: memory.id, expectedRevision: memory.revision },
    };
    await this.send();
  };
  private async send() {
    const attempt = this.attempt;
    if (!attempt || this.disposed) return;
    this.publish({ busy: true, notice: null });
    try {
      if (attempt.kind === "propose") {
        const approval = await this.run(this.client.propose(attempt.input));
        if (this.disposed) return;
        this.approvalId = approval.id;
        this.attempt = null;
        this.publish({ approval, stage: "ready" });
      } else {
        if (attempt.kind === "decide") await this.run(this.client.decide(attempt.input));
        else await this.run(this.client.remove(attempt.input));
        if (this.disposed) return;
        this.acknowledged = true;
        this.approvalId = null;
        await this.read();
      }
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  }
  retry = async () => {
    if (!this.view.busy && this.view.stage === "uncertain") await this.send();
  };
  dismiss = () => {
    const approval = this.view.approval;
    if (!this.editable() || !approval) return;
    if (
      ["pending", "approved"].includes(approval.status) &&
      Date.parse(approval.expiresAt) > Date.now()
    )
      return;
    this.approvalId = null;
    this.publish({ approval: null, generation: this.view.generation + 1 });
  };
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.attempt = null;
    this.approvalId = null;
    this.acknowledged = false;
    this.view = initialMemoryView;
    this.listeners.clear();
  }
}
