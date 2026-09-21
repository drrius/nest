import type { ProposedMeal } from "@nest/contracts/meal-proposals";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { MealProposalRuntime, ProposalView } from "./proposal-runtime";
import { canEditProposal, type ProposalEditTarget } from "./proposal-edit-runtime";
const slotNames = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
export function ProposalEntryCard({
  entry,
  view,
  runtime,
  open,
  choose,
}: {
  entry: ProposedMeal;
  view: ProposalView;
  runtime: MealProposalRuntime;
  open: () => void;
  choose: (target: ProposalEditTarget) => void;
}) {
  const proposal = view.proposal;
  const target: ProposalEditTarget | null = proposal
    ? {
        action: "replace",
        proposalId: proposal.proposalId,
        expectedRevision: proposal.revision,
        entryId: entry.entryId,
      }
    : null;
  return (
    <Card>
      <Note>
        {entry.date} · {slotNames[entry.slot]}
      </Note>
      <Section title={entry.source.recipe.title} />
      <Note>{entry.source.kind === "saved" ? "Saved recipe" : "New suggestion"}</Note>
      {entry.estimatedCaloriesPerServing !== null ? (
        <Note>About {entry.estimatedCaloriesPerServing} kcal per serving · estimate</Note>
      ) : null}
      <NativeAction label="View recipe" onPress={open} />
      {proposal?.status === "ready" ? (
        <>
          <NativeAction
            label="Generate a replacement"
            disabled={view.busy || !canEditProposal(view)}
            onPress={() => {
              if (target) void runtime.edit(target);
            }}
          />
          <NativeAction
            label="Choose a saved recipe"
            disabled={view.busy || !canEditProposal(view)}
            onPress={() => {
              if (target) choose(target);
            }}
          />
        </>
      ) : null}
    </Card>
  );
}
