import type { AssistantMessage } from "@nest/ai/chat";
import { Chat } from "@ai-sdk/react";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { StartTurn, TurnReceipt } from "@nest/contracts/conversations";
import type { AssistantClient } from "./client.ts";
import { AssistantFailure } from "./request.ts";
import { reconcileConversation, turnNotice } from "./reconcile.ts";
export interface ConversationView {
  loaded: boolean;
  busy: boolean;
  pending: typeof TurnReceipt.Type | null;
  retryable: boolean;
  notice: string | null;
  savedOperation: string | null;
}
const initial: ConversationView = {
  loaded: false,
  busy: false,
  pending: null,
  retryable: false,
  notice: null,
  savedOperation: null,
};
export class ConversationRuntime {
  readonly chat: Chat<AssistantMessage>;
  private view = initial;
  private revision = "0";
  private disposed = false;
  private attempt: StartTurn | null = null;
  private pendingOperation: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly lifetime = new AbortController();
  private readonly client: AssistantClient;
  private readonly id: string;
  private readonly uuid: () => string;
  constructor(client: AssistantClient, id: string, uuid: () => string) {
    this.client = client;
    this.id = id;
    this.uuid = uuid;
    this.chat = new Chat<AssistantMessage>({
      id,
      generateId: uuid,
      transport: client.transport(() => this.attempt),
    });
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<ConversationView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, AssistantFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private async reconcile() {
    const { saved, operation, turn } = await this.run(
      reconcileConversation(this.client, this.id, this.attempt),
    );
    if (this.disposed) return;
    this.chat.messages = saved.messages;
    this.revision = saved.revision;
    const acknowledged =
      this.attempt !== null &&
      saved.messages.some((message) => message.id === this.attempt?.operationId);
    const running = turn?.state === "running";
    if (turn && !running) this.attempt = null;
    this.pendingOperation = running ? operation : null;
    this.publish({
      loaded: true,
      pending: running ? turn : null,
      retryable: this.canRetry(turn),
      savedOperation: acknowledged ? operation : this.view.savedOperation,
      notice: turnNotice(turn?.state),
    });
  }
  private canRetry(turn: typeof TurnReceipt.Type | null) {
    return (
      this.attempt !== null && turn === null && this.attempt.expectedRevision === this.revision
    );
  }
  private failed(error: unknown) {
    if (this.disposed) return;
    if (Schema.is(AssistantFailure)(error) && ["session", "forbidden"].includes(error.code))
      this.chat.messages = [];
    this.publish({
      loaded: false,
      retryable: false,
      notice: "Could not confirm the saved conversation. Reload before sending another message.",
    });
  }
  load = async () => {
    if (this.view.busy || this.disposed) return;
    this.publish({ busy: true });
    try {
      await this.reconcile();
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  };
  private async sendAttempt() {
    if (!this.attempt || this.disposed) return;
    this.publish({ busy: true, retryable: false, notice: null });
    try {
      await this.chat.sendMessage({
        id: this.attempt.operationId,
        role: "user",
        parts: [{ type: "text", text: this.attempt.text }],
      });
      await this.reconcile();
      if (this.view.retryable)
        this.publish({
          notice: "Your message has not been confirmed. You can retry this exact message online.",
        });
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  }
  send = async (text: string) => {
    if (
      !this.view.loaded ||
      this.view.busy ||
      this.view.pending ||
      this.view.retryable ||
      this.disposed
    )
      return;
    const value = {
      conversationId: this.id,
      operationId: this.uuid(),
      expectedRevision: this.revision,
      text: text.trim(),
    };
    if (!Schema.is(StartTurn)(value)) {
      this.publish({ notice: "Write a message of up to 2,000 characters." });
      return;
    }
    this.attempt = value;
    await this.sendAttempt();
  };
  retry = async () => {
    if (!this.view.busy && this.view.retryable) await this.sendAttempt();
  };
  stop = () => this.chat.stop();
  recover = async () => {
    if (this.view.busy || !this.pendingOperation || this.disposed) return;
    this.publish({ busy: true });
    try {
      await this.run(this.client.turn(this.id, this.pendingOperation, true));
      await this.reconcile();
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  };
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.attempt = null;
    this.pendingOperation = null;
    void this.chat.stop();
    this.chat.messages = [];
    this.listeners.clear();
  }
}
