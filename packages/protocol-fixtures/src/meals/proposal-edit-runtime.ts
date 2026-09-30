import type * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MealProposalEditCommand, type MealProposalEdit } from "@nest/contracts/meal-proposals";
import { PreferenceFailure } from "../preferences/client.ts";
import type { OfflineFailure } from "../offline/contracts.ts";
import type { OfflineAccount } from "../offline/owner.ts";
import type { MealClient } from "./client.ts";
import type { ProposalView } from "./proposal-runtime.ts";
export type ProposalEditTarget =
  | Omit<Extract<MealProposalEditCommand, { action: "replace" }>, "operationId">
  | Omit<Extract<MealProposalEditCommand, { action: "choose" }>, "operationId">;
type Dependencies = {
  account: OfflineAccount;
  client: MealClient["proposals"]["edits"];
  weekStart: string;
  uuid: () => string;
  view: () => ProposalView;
  publish: (patch: Partial<ProposalView>) => void;
  refresh: () => Promise<void>;
  run: <A>(effect: Effect.Effect<A, PreferenceFailure | OfflineFailure>) => Promise<A>;
};
const conflict = (error: unknown) =>
  Schema.is(PreferenceFailure)(error) && error.code === "conflict";
export class ProposalEditRuntime {
  private readonly deps: Dependencies;
  constructor(deps: Dependencies) {
    this.deps = deps;
  }
  async start(target: ProposalEditTarget) {
    const { view, account, weekStart, run, publish, uuid } = this.deps;
    const current = view(),
      proposal = current.proposal;
    if (!canEditProposal(current) || !proposal) return;
    if (
      proposal.proposalId !== target.proposalId ||
      proposal.revision !== target.expectedRevision ||
      !proposal.entries?.some((e) => e.entryId === target.entryId)
    )
      return;
    const command = { ...target, operationId: uuid() };
    const attempt = await run(
      account.store.stageProposalEdit(account.session, { weekStart, command }),
    );
    publish({ attempt });
    await this.send();
  }
  async recover() {
    const command = this.deps.view().attempt?.edit;
    if (!command) return;
    try {
      await this.accept(await this.deps.run(this.deps.client.recover(command.operationId)));
    } catch (error) {
      if (!conflict(error)) throw error;
      this.deps.publish({
        fresh: false,
        notice:
          "This edit has not been confirmed. Continue the saved request to recover or submit its original intent.",
      });
    }
  }
  async send() {
    const command = this.deps.view().attempt?.edit;
    if (!command) return;
    this.deps.publish({ fresh: false });
    try {
      await this.accept(await this.deps.run(this.deps.client.execute(command)));
    } catch (error) {
      if (!conflict(error) && !(Schema.is(PreferenceFailure)(error) && error.code === "invalid"))
        throw error;
      // A completion conflict can follow a committed reservation. Only confirmed absence clears it.
      let current: MealProposalEdit;
      try {
        current = await this.deps.run(this.deps.client.recover(command.operationId));
      } catch (readError) {
        if (!conflict(readError)) throw readError;
        await this.clear(command.operationId);
        this.deps.publish({
          fresh: false,
          notice:
            "The proposal or recipe could not be used. Check that the recipe is complete, refresh and choose again.",
        });
        return;
      }
      await this.accept(current);
    }
  }
  private async accept(edit: MealProposalEdit) {
    const command = this.deps.view().attempt?.edit;
    if (!command || !Schema.toEquivalence(MealProposalEditCommand)(command, edit.command))
      throw new PreferenceFailure({ code: "unavailable" });
    if (edit.status === "pending") {
      this.deps.publish({
        fresh: false,
        notice:
          "This meal edit is still pending. Refresh to check it; continuing the saved request will not repeat a claimed model run.",
      });
      return;
    }
    await this.deps.refresh();
    const proposal = this.deps.view().proposal;
    if (edit.receipt && (!proposal || BigInt(proposal.revision) < BigInt(edit.receipt.revision)))
      throw new PreferenceFailure({ code: "unavailable" });
    await this.clear(command.operationId);
    this.deps.publish({
      notice:
        edit.status === "applied"
          ? "The suggestion was updated. Review the preview before approving."
          : editFailure(edit.failure),
    });
  }
  private async clear(operationId: string) {
    const { account, run, weekStart, publish } = this.deps;
    const attempt = await run(
      account.store.clearProposalEdit(account.session, { weekStart, operationId }),
    );
    publish({ attempt });
  }
}
export function canEditProposal(view: ProposalView) {
  return (
    view.access === "ready" &&
    view.fresh &&
    view.proposal?.status === "ready" &&
    !!view.attempt &&
    !view.attempt.edit &&
    !view.attempt.approval &&
    !view.attempt.discard
  );
}
function editFailure(failure: MealProposalEdit["failure"]) {
  if (failure === "no_suitable_meals")
    return "No suitable replacement was found. The original suggestion was kept.";
  if (failure === "constraints_changed")
    return "Food preferences, the library or week changed. The original preview was kept; review current details before trying again.";
  return "The edit could not finish. The original suggestion was kept. You can explicitly try a new edit.";
}
