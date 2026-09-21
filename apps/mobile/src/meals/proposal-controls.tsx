import { useState } from "react";
import { Alert, useColorScheme } from "react-native";
import { Host, Switch } from "@expo/ui";
import { Link } from "expo-router";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet } from "../theme";
import type { MealProposalRuntime, ProposalView } from "./proposal-runtime";
const failures = {
  unavailable: "This attempt could not finish. No meals were saved.",
  constraints_changed:
    "Food preferences, saved recipes or the week changed. Make a new preview from the current details.",
  incomplete_preferences:
    "Both partners need to complete their food preferences before planning together.",
  no_suitable_meals:
    "A suitable plan could not be made from this attempt. Check your food preferences and saved recipes.",
};
export function ProposalControls({
  runtime,
  view,
}: {
  runtime: MealProposalRuntime;
  view: ProposalView;
}) {
  return (
    <Section title={`Week of ${runtime.weekStart}`}>
      <Note>This preview is private. Generating it does not add meals or groceries.</Note>
      {view.busy ? (
        <Note>Working on this request… You can leave and recover it from this week.</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {!view.attempt ? <GenerateControl runtime={runtime} view={view} /> : null}
      <ProposalStatus view={view} />
      <ProposalActions runtime={runtime} view={view} />
      {view.proposal?.status === "approved" ? (
        <>
          <Link href={{ pathname: "/meals", params: { weekStart: runtime.weekStart } }}>
            Open saved meal week
          </Link>
          <Link href={{ pathname: "/meal-ingredients", params: { weekStart: runtime.weekStart } }}>
            Review ingredients for groceries
          </Link>
        </>
      ) : null}
      <Link href="/food-preferences">Your food preferences</Link>
      <Link href="/cooking-preferences">Household cooking preferences</Link>
    </Section>
  );
}
function GenerateControl({ runtime, view }: { runtime: MealProposalRuntime; view: ProposalView }) {
  const [familiar, setFamiliar] = useState(false),
    colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Card>
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Switch
          label="Saved recipes only"
          value={familiar}
          onValueChange={setFamiliar}
          disabled={view.busy}
        />
      </Host>
      <Note>
        {familiar
          ? "Use complete recipes from your saved library."
          : "Prefer saved recipes and include new suggestions."}
      </Note>
      <NativeAction
        label="Generate preview"
        disabled={view.busy || !view.fresh}
        onPress={() => {
          void runtime.start(familiar);
        }}
      />
    </Card>
  );
}

function ProposalStatus({ view }: { view: ProposalView }) {
  const proposal = view.proposal;
  if (!proposal) return null;
  const states = {
    ready: "Preview ready · not saved to your meal week",
    generating:
      "No preview is ready yet. Continue the saved request or refresh to check its progress.",
    discarded: "This proposal was discarded.",
    approved: "This proposal was approved. Open Meals for the current week.",
    failed: proposal.failure ? failures[proposal.failure] : "This proposal could not finish.",
  };
  return (
    <>
      {!view.fresh ? (
        <Note>Previously loaded preview · connect and refresh before changing it.</Note>
      ) : null}
      <Note>{states[proposal.status]}</Note>
    </>
  );
}
function ProposalActions({ runtime, view }: { runtime: MealProposalRuntime; view: ProposalView }) {
  const done = view.proposal && ["discarded", "failed", "approved"].includes(view.proposal.status);
  return (
    <>
      <NativeAction
        label="Refresh proposal"
        disabled={view.busy}
        onPress={() => {
          void runtime.load();
        }}
      />
      {done && !view.attempt?.edit ? (
        <NativeAction
          label="Plan again"
          disabled={view.busy || !view.fresh}
          onPress={() => {
            void runtime.reset();
          }}
        />
      ) : (
        <PendingActions runtime={runtime} view={view} />
      )}
    </>
  );
}
function PendingActions({ runtime, view }: { runtime: MealProposalRuntime; view: ProposalView }) {
  if (!view.attempt) return null;
  const continuing =
    !!view.attempt.edit ||
    !!view.attempt.approval ||
    view.attempt.discard !== null ||
    view.proposal?.status !== "ready";
  return (
    <>
      {continuing ? (
        <NativeAction
          label={continueLabel(view)}
          disabled={view.busy}
          onPress={() => {
            void runtime.continue();
          }}
        />
      ) : null}
      {!view.attempt.edit && !view.attempt.discard && !view.attempt.approval ? (
        <>
          <ApproveAction runtime={runtime} view={view} />
          <DiscardAction runtime={runtime} view={view} />
        </>
      ) : null}
    </>
  );
}
function ApproveAction({ runtime, view }: { runtime: MealProposalRuntime; view: ProposalView }) {
  const proposal = view.proposal;
  if (proposal?.status !== "ready") return null;
  return (
    <NativeAction
      label="Approve this plan"
      disabled={view.busy || !view.fresh}
      onPress={() => {
        Alert.alert(
          "Save this meal plan?",
          "Save the displayed meals to your shared week. Existing meals stay in place. Groceries require a separate review.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Save plan",
              onPress: () => {
                void runtime.approve(proposal.revision, proposal.proposalId);
              },
            },
          ],
        );
      }}
    />
  );
}
function DiscardAction({ runtime, view }: { runtime: MealProposalRuntime; view: ProposalView }) {
  const proposal = view.proposal;
  if (!proposal) return null;
  return (
    <NativeAction
      label="Discard proposal"
      disabled={view.busy || !view.fresh}
      onPress={() => {
        Alert.alert(
          "Discard this proposal?",
          "Your saved meal week and groceries will stay unchanged.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Discard",
              style: "destructive",
              onPress: () => {
                void runtime.discard(proposal.revision, proposal.proposalId);
              },
            },
          ],
        );
      }}
    />
  );
}

function continueLabel(view: ProposalView) {
  if (view.attempt?.edit) return "Continue saved meal edit";
  if (view.attempt?.approval) return "Recover approval request";
  if (view.attempt?.discard) return "Recover discard request";
  return "Continue saved request";
}
