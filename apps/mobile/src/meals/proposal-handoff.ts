import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { MealProposalGenerationResult, ReadMealProposal } from "@nest/contracts/meal-proposals";
import { MealWeekStart } from "@nest/contracts/meals";
import type { OfflineAccount } from "../offline/owner.ts";
import type { OfflineFailure } from "../offline/contracts.ts";
import { PreferenceFailure } from "../preferences/client.ts";
import type { MealClient } from "./client.ts";
import type { ProposalView } from "./proposal-runtime.ts";
import { requestedMealWeek } from "./route-week.ts";
export type ProposalScope = string | { weekStart: string; proposalId: string };
export function requestedProposalScope(
  params: { weekStart?: unknown; proposalId?: unknown },
  today: string,
): ProposalScope | null {
  if (params.proposalId === undefined) return requestedMealWeek(params.weekStart, today);
  if (
    !Schema.is(MealWeekStart)(params.weekStart) ||
    !Schema.is(ReadMealProposal.fields.proposalId)(params.proposalId)
  )
    return null;
  return { weekStart: params.weekStart, proposalId: params.proposalId.toLowerCase() };
}
type Dependencies = {
  account: OfflineAccount;
  client: MealClient["proposals"];
  weekStart: string;
  view: () => ProposalView;
  publish: (patch: Partial<ProposalView>) => void;
  run: <A>(effect: Effect.Effect<A, PreferenceFailure | OfflineFailure>) => Promise<A>;
};
export class ProposalHandoff {
  private target: string | null;
  private deps: Dependencies;
  constructor(target: string | null, deps: Dependencies) {
    this.target = target;
    this.deps = deps;
  }
  async open() {
    if (!this.target) return false;
    const { account, client, weekStart, view, publish, run } = this.deps;
    const previous = view();
    if (previous.attempt?.proposalId === this.target) {
      this.target = null;
      return true;
    }
    if (blocked(previous)) {
      publish({
        notice:
          "A different request is saved on this iPhone. Finish or recover it first, then refresh to open the requested preview.",
      });
      return true;
    }
    const result = Schema.decodeUnknownSync(MealProposalGenerationResult)(
      await run(client.open(this.target)),
      { onExcessProperty: "error" },
    );
    if (result.receipt.weekStart !== weekStart || result.receipt.proposalId !== this.target)
      throw new PreferenceFailure({ code: "unavailable" });
    const attempt = await run(
      account.store.adoptMealProposal(account.session, {
        receipt: result.receipt,
        previousOperationId: previous.attempt?.generation.operationId ?? null,
      }),
    );
    publish({
      attempt,
      proposal: result.envelope.proposal,
      week: null,
      fresh: true,
      access: "ready",
    });
    this.target = null;
    return true;
  }
}
function blocked(view: ProposalView) {
  const attempt = view.attempt;
  if (!attempt) return false;
  return (
    !view.fresh ||
    !view.proposal ||
    view.proposal.status === "generating" ||
    !!attempt.edit ||
    !!attempt.approval ||
    !!attempt.discard
  );
}
