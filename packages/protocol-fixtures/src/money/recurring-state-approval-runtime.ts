import {
  matchesRecurringStateContext,
  recurringStateRevisionSuperseded,
} from "./recurring-state-approval-display.ts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import {
  lifecycleDatePassed,
  lifecycleDecision,
  type RecurringLifecycleApproval as RecurringStateApproval,
} from "./recurring-lifecycle-approval.ts";
import type { RecurringStateApprovalAttempt } from "./recurring-state-approval-attempt.ts";
import type {
  RecurringStateApprovalOperations,
  RecurringStateApprovalContext,
} from "./recurring-state-approval-operations.ts";
export interface RecurringStateApprovalView {
  approval: RecurringStateApproval | null;
  context: RecurringStateApprovalContext | null;
  attempt: RecurringStateApprovalAttempt | null;
  active: boolean;
  online: boolean;
  busy: boolean;
  fresh: boolean;
  verify: boolean;
  notice: string | null;
}
const terminal = (approval: RecurringStateApproval) =>
  ["consumed", "denied"].includes(approval.status);
export class RecurringStateApprovalRuntime {
  private view: RecurringStateApprovalView = {
    approval: null,
    context: null,
    attempt: null,
    active: false,
    online: false,
    busy: false,
    fresh: false,
    verify: false,
    notice: null,
  };
  private readonly operations: RecurringStateApprovalOperations;
  private readonly approvalId: string;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private request: AbortController | null = null;
  private disposed = false;
  constructor(operations: RecurringStateApprovalOperations, approvalId: string, now = Date.now) {
    this.operations = operations;
    this.approvalId = approvalId;
    this.now = now;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<RecurringStateApprovalView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private current(request: AbortController) {
    return !this.disposed && this.request === request && !request.signal.aborted;
  }
  private available() {
    return (
      !this.disposed && this.view.active && this.view.online && !this.view.busy && !this.view.verify
    );
  }
  setActive = (active: boolean) => {
    if (this.disposed || this.view.active === active) return Promise.resolve();
    this.request?.abort();
    this.request = null;
    this.publish({
      active,
      busy: false,
      fresh: false,
      approval: null,
      context: null,
      attempt: null,
      notice: null,
    });
    return active ? this.refresh() : Promise.resolve();
  };
  setOnline = (online: boolean) => {
    if (this.disposed || this.view.online === online) return Promise.resolve();
    this.request?.abort();
    this.request = null;
    this.publish({ online, busy: false, fresh: false });
    return online && this.view.active ? this.refresh() : Promise.resolve();
  };
  private async perform(body: (request: AbortController) => Promise<void>) {
    const request = new AbortController();
    this.request = request;
    this.publish({ busy: true, notice: null });
    try {
      await body(request);
    } catch (error) {
      if (this.current(request)) this.failed(error);
    } finally {
      if (this.current(request)) {
        this.request = null;
        this.publish({ busy: false });
      }
    }
  }
  refresh = async () => {
    if (!this.available()) return;
    this.publish({ fresh: false });
    await this.perform(async (request) => {
      const attempt = await Effect.runPromise(this.operations.saved(this.approvalId), {
        signal: request.signal,
      });
      if (!this.current(request)) return;
      this.publish({ attempt });
      let approval = await Effect.runPromise(this.operations.read(this.approvalId), {
        signal: request.signal,
      });
      if (!this.current(request)) return;
      if (attempt && attempt.operationId !== approval.operationId)
        throw new PreferenceFailure({ code: "unavailable" });
      const context = terminal(approval)
        ? null
        : await Effect.runPromise(this.operations.context(approval.change), {
            signal: request.signal,
          });
      if (!this.current(request)) return;
      const recovered = await this.recover({ approval, context, attempt }, request);
      if (!this.current(request)) return;
      approval = recovered.approval;
      this.publish({
        approval,
        context: terminal(approval) ? null : context,
        fresh: true,
        notice: recoveryNotice(approval, attempt, recovered.superseded),
      });
    });
  };
  private async recover(
    loaded: Pick<RecurringStateApprovalView, "approval" | "context" | "attempt"> & {
      approval: RecurringStateApproval;
    },
    request: AbortController,
  ) {
    let { approval } = loaded;
    const { context, attempt } = loaded;
    const superseded = Boolean(
      attempt?.approved &&
      (recurringStateRevisionSuperseded(approval, context) || lifecycleDatePassed(approval)),
    );
    if (superseded && attempt) {
      // Recheck after observing a committed revision. An older in-flight CAS can
      // no longer succeed, but it may have committed before that revision changed.
      approval = await Effect.runPromise(this.operations.read(this.approvalId), {
        signal: request.signal,
      });
      if (!this.current(request)) return { approval, superseded };
      if (approval.operationId !== attempt.operationId)
        throw new PreferenceFailure({ code: "unavailable" });
    }
    if (superseded || terminal(approval)) await this.clear(attempt, request);
    return { approval, superseded };
  }
  decide = async (expected: RecurringStateApproval, approved: boolean) => {
    if (
      !this.available() ||
      !this.view.fresh ||
      this.view.attempt ||
      this.view.approval !== expected ||
      terminal(expected) ||
      (approved && !matchesRecurringStateContext(expected, this.view.context))
    )
      return;
    if (Date.parse(expected.expiresAt) <= this.now()) {
      this.publish({
        fresh: false,
        notice: "This proposal has expired. Reload its current status.",
      });
      return;
    }
    const attempt = { approvalId: expected.id, operationId: expected.operationId, approved };
    await this.perform(async (request) => {
      await Effect.runPromise(
        this.operations.stage(attempt, () => this.current(request)),
        { signal: request.signal },
      );
      if (!this.current(request)) return;
      this.publish({ attempt });
      await this.send(expected, attempt, request);
    });
  };
  retry = async () => {
    const { attempt, approval } = this.view;
    if (!this.available() || !this.view.fresh || !attempt || !approval || terminal(approval))
      return;
    await this.perform(async (request) => {
      // Reassert the persisted identity before every explicit retry; never queue or auto-send.
      await Effect.runPromise(
        this.operations.stage(attempt, () => this.current(request)),
        { signal: request.signal },
      );
      if (this.current(request)) await this.send(approval, attempt, request);
    });
  };
  private async send(
    approval: RecurringStateApproval,
    attempt: RecurringStateApprovalAttempt,
    request: AbortController,
  ) {
    const result = await Effect.runPromise(
      this.operations.decide(lifecycleDecision(approval, attempt)),
      { signal: request.signal },
    );
    if (!this.current(request)) return;
    this.publish({ approval: result, fresh: true, notice: null });
    await this.clear(attempt, request);
  }
  private async clear(attempt: RecurringStateApprovalAttempt | null, request: AbortController) {
    if (!attempt) return;
    await Effect.runPromise(this.operations.clear(attempt), { signal: request.signal });
    if (this.current(request)) this.publish({ attempt: null });
  }
  private failed(error: unknown) {
    const storage = Schema.is(OfflineFailure)(error) ? error.reason : null;
    const code = Schema.is(PreferenceFailure)(error) ? error.code : null;
    if (storage === "session_changed" || code === "session" || code === "forbidden") {
      this.publish({
        approval: null,
        context: null,
        attempt: null,
        fresh: false,
        verify: true,
        notice: "Verify your account before opening this private proposal.",
      });
      return;
    }
    this.publish({
      fresh: false,
      notice:
        this.view.approval && terminal(this.view.approval)
          ? "The server confirmed this outcome. Reload to finish local recovery."
          : "Could not confirm the outcome. Reload online before making another decision.",
    });
  }
  dispose = () => {
    if (this.disposed) return;
    this.request?.abort();
    this.request = null;
    this.publish({
      approval: null,
      context: null,
      attempt: null,
      active: false,
      busy: false,
      fresh: false,
    });
    this.disposed = true;
    this.listeners.clear();
  };
}

function recoveryNotice(
  approval: RecurringStateApproval,
  attempt: RecurringStateApprovalAttempt | null,
  superseded: boolean,
) {
  if (terminal(approval)) return null;
  if (superseded)
    return `${lifecycleDatePassed(approval) ? "The resume date has passed." : "The rule changed."} This proposal can no longer be approved. You can decline it and request a new proposal.`;
  return attempt
    ? "An earlier decision is unresolved. Check again or retry that exact decision."
    : null;
}
