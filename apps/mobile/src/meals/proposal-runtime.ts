import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { MealProposal, MealProposalEnvelope } from "@nest/contracts/meal-proposals";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import { PreferenceFailure } from "../preferences/client.ts";
import { OfflineFailure } from "../offline/contracts.ts";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MealClient } from "./client.ts";
import type { MealProposalAttempt } from "./proposal-attempt.ts";
import { matchesApprovedPreview } from "./proposal-approval.ts";
export type ProposalView = {
  week: MealWeekSnapshot | null;
  attempt: MealProposalAttempt | null;
  proposal: MealProposal | null;
  busy: boolean;
  fresh: boolean;
  access: "ready" | "verify";
  notice: string | null;
};
type Client = Pick<MealClient, "read" | "proposals">;
const terminal = (proposal: MealProposal | null) =>
  !!proposal && ["failed", "discarded", "approved"].includes(proposal.status);
export class MealProposalRuntime {
  private view: ProposalView = {
    week: null,
    attempt: null,
    proposal: null,
    busy: false,
    fresh: false,
    access: "ready",
    notice: null,
  };
  private client: Client;
  private account: OfflineAccount;
  private uuid: () => string;
  private disposed = false;
  private lifetime = new AbortController();
  private listeners = new Set<() => void>();
  readonly weekStart: string;
  constructor(client: Client, account: OfflineAccount, weekStart: string, uuid: () => string) {
    this.client = client;
    this.account = account;
    this.weekStart = weekStart;
    this.uuid = uuid;
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<ProposalView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
  private run<A>(effect: Effect.Effect<A, PreferenceFailure | OfflineFailure>) {
    return Effect.runPromise(effect, { signal: this.lifetime.signal });
  }
  private async perform(action: () => Promise<void>) {
    if (this.disposed || this.view.busy) return;
    this.publish({ busy: true, notice: null });
    try {
      await action();
    } catch (error) {
      this.failed(error);
    } finally {
      this.publish({ busy: false });
    }
  }
  load = () =>
    this.perform(async () => {
      this.publish({ fresh: false });
      const { store, session } = this.account;
      const attempt = await this.run(store.readMealProposalAttempt(session, this.weekStart));
      const changed = attempt?.generation.operationId !== this.view.attempt?.generation.operationId;
      this.publish({ attempt, ...(changed ? { proposal: null, week: null } : {}) });
      if (attempt?.proposalId) await this.recover();
      else if (attempt)
        this.publish({
          access: "ready",
          notice:
            "A request is saved on this iPhone. Continue it to recover its reservation and generate the preview.",
        });
      else await this.readWeek();
    });
  private async readWeek() {
    const week = await this.run(this.client.read(this.weekStart));
    this.publish({ week, fresh: true, access: "ready" });
  }
  private adopt(envelope: typeof MealProposalEnvelope.Type) {
    const attempt = this.view.attempt;
    const proposal = envelope.proposal;
    if (
      !attempt ||
      proposal.proposalId !== attempt.proposalId ||
      proposal.weekStart !== this.weekStart ||
      proposal.weekRevision !== attempt.generation.expectedWeekRevision ||
      proposal.familiarOnly !== attempt.generation.familiarOnly
    )
      throw new PreferenceFailure({ code: "unavailable" });
    if (this.view.proposal && BigInt(proposal.revision) < BigInt(this.view.proposal.revision))
      throw new PreferenceFailure({ code: "unavailable" });
    this.publish({ proposal, fresh: true, access: "ready" });
  }
  private async recover() {
    const id = this.view.attempt?.proposalId;
    if (!id) return;
    this.adopt(await this.run(this.client.proposals.recover(id)));
  }
  start = (familiarOnly: boolean) =>
    this.perform(async () => {
      if (this.view.attempt || !this.view.fresh || !this.view.week || this.view.access !== "ready")
        return;
      const { store, session } = this.account;
      const attempt = await this.run(
        store.stageMealProposal(session, {
          operationId: this.uuid(),
          weekStart: this.weekStart,
          expectedWeekRevision: this.view.week.revision,
          familiarOnly,
        }),
      );
      this.publish({ attempt, proposal: null });
      await this.generate();
    });
  continue = () =>
    this.perform(async () => {
      if (this.view.access !== "ready" || !this.view.attempt) return;
      if (this.view.attempt.approval) await this.retryApproval();
      else if (this.view.attempt.discard) await this.retryDiscard();
      else await this.generate();
    });
  private async reserve() {
    const attempt = this.view.attempt;
    if (!attempt || attempt.proposalId) return;
    const { store, session } = this.account;
    try {
      const receipt = await this.run(this.client.proposals.reserve(attempt.generation));
      const recorded = await this.run(store.recordMealProposal(session, receipt));
      this.publish({ attempt: recorded });
    } catch (error) {
      // Reservation has no model side effect. An exact reservation conflict requires a fresh week.
      if (Schema.is(PreferenceFailure)(error) && error.code === "conflict") {
        await this.run(
          store.clearMealProposalAttempt(session, {
            weekStart: this.weekStart,
            operationId: attempt.generation.operationId,
          }),
        );
        this.publish({
          attempt: null,
          fresh: false,
          notice:
            "The week or food setup changed. Reload and check both partners’ food preferences.",
        });
        return;
      }
      throw error;
    }
  }
  private async generate() {
    await this.reserve();
    const attempt = this.view.attempt;
    if (this.disposed || !attempt?.proposalId) return;
    await this.recover();
    if (this.view.proposal?.status !== "generating") return;
    this.publish({ fresh: false });
    const result = await this.run(this.client.proposals.generate(attempt.generation));
    this.adopt(result.envelope);
  }
  private displayedProposal(revision: string, id: string) {
    const proposal = this.view.proposal;
    return proposal?.proposalId === id && proposal.revision === revision ? proposal : null;
  }
  discard = (expectedRevision: string, proposalId: string) =>
    this.perform(async () => {
      const proposal = this.displayedProposal(expectedRevision, proposalId);
      if (
        !proposal ||
        !this.view.fresh ||
        !this.view.attempt ||
        this.view.attempt.discard ||
        this.view.attempt.approval ||
        (terminal(proposal) && proposal.status !== "failed")
      )
        return;
      const { store, session } = this.account;
      const attempt = await this.run(
        store.stageProposalDiscard(session, {
          weekStart: this.weekStart,
          command: {
            operationId: this.uuid(),
            proposalId: proposal.proposalId,
            expectedRevision: proposal.revision,
          },
        }),
      );
      this.publish({ attempt });
      await this.sendDiscard();
    });
  private async retryDiscard() {
    await this.recover();
    if (this.view.proposal && ["discarded", "approved"].includes(this.view.proposal.status)) return;
    await this.sendDiscard();
  }
  approve = (expectedRevision: string, proposalId: string) =>
    this.perform(async () => {
      const proposal = this.displayedProposal(expectedRevision, proposalId);
      if (
        !proposal ||
        proposal.status !== "ready" ||
        !this.view.fresh ||
        !this.view.attempt ||
        this.view.attempt.discard ||
        this.view.attempt.approval ||
        this.view.access !== "ready"
      )
        return;
      const { store, session } = this.account;
      const attempt = await this.run(
        store.stageProposalApproval(session, {
          weekStart: this.weekStart,
          command: { operationId: this.uuid(), proposalId: proposal.proposalId, expectedRevision },
        }),
      );
      this.publish({ attempt });
      await this.sendApproval();
    });
  private async retryApproval() {
    await this.recover();
    if (terminal(this.view.proposal)) return;
    await this.sendApproval();
  }
  private async sendApproval() {
    const command = this.view.attempt?.approval,
      proposal = this.view.proposal;
    if (!command || !proposal) return;
    const { store, session } = this.account;
    try {
      const receipt = await this.run(this.client.proposals.approve(command));
      if (!matchesApprovedPreview(proposal, receipt))
        throw new PreferenceFailure({ code: "unavailable" });
      this.publish({
        proposal: { ...proposal, status: "approved", revision: receipt.revision },
        fresh: true,
      });
    } catch (error) {
      if (Schema.is(PreferenceFailure)(error) && error.code === "conflict") {
        const attempt = await this.run(
          store.clearProposalApproval(session, {
            weekStart: this.weekStart,
            operationId: command.operationId,
          }),
        );
        this.publish({
          attempt,
          fresh: false,
          notice:
            "The proposal, food preferences or meal week changed. Refresh and review before approving again.",
        });
        return;
      }
      throw error;
    }
  }
  private async sendDiscard() {
    const command = this.view.attempt?.discard;
    const proposal = this.view.proposal;
    if (!command || !proposal) return;
    const { store, session } = this.account;
    try {
      const receipt = await this.run(this.client.proposals.discard(command));
      this.publish({
        proposal: { ...proposal, status: "discarded", failure: null, revision: receipt.revision },
        fresh: true,
      });
    } catch (error) {
      if (Schema.is(PreferenceFailure)(error) && error.code === "conflict") {
        const attempt = await this.run(
          store.clearProposalDiscard(session, {
            weekStart: this.weekStart,
            operationId: command.operationId,
          }),
        );
        this.publish({
          attempt,
          fresh: false,
          notice: "The proposal changed. Refresh and review it before discarding.",
        });
        return;
      }
      throw error;
    }
  }
  reset = () =>
    this.perform(async () => {
      if (!this.view.fresh || !terminal(this.view.proposal) || !this.view.attempt) return;
      const { store, session } = this.account;
      await this.run(
        store.clearMealProposalAttempt(session, {
          weekStart: this.weekStart,
          operationId: this.view.attempt.generation.operationId,
        }),
      );
      this.publish({ attempt: null, proposal: null, fresh: false, week: null });
      await this.readWeek();
    });
  private failed(error: unknown) {
    if (this.disposed) return;
    const denied =
      (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code)) ||
      (Schema.is(OfflineFailure)(error) && error.reason === "session_changed");
    if (denied)
      this.publish({
        week: null,
        proposal: null,
        attempt: null,
        fresh: false,
        access: "verify",
        notice: "Verify your account before viewing this private proposal.",
      });
    else
      this.publish({
        fresh: false,
        notice:
          "Could not confirm the latest state. Connect and refresh or continue the same saved request.",
      });
  }
  dispose() {
    this.disposed = true;
    this.lifetime.abort();
    this.listeners.clear();
  }
}
