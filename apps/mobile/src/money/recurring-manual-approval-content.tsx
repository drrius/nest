import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useApprovalClock } from "./use-approval-clock";
import {
  manualCycleApprovalActions,
  manualCycleApprovalText,
} from "./recurring-manual-approval-display";
import type {
  ManualCycleApprovalRuntime,
  ManualCycleApprovalView,
} from "./recurring-manual-approval-runtime";
interface Props {
  runtime: ManualCycleApprovalRuntime;
  view: ManualCycleApprovalView;
  actor: string;
}
export function ManualCycleApprovalContent(props: Props) {
  const { view, runtime, actor } = props;
  return (
    <Page>
      <Note>
        Private proposal · only your confirmation links this existing expense to a recurring cycle.
      </Note>
      {!view.online ? <Note>Connect to review or confirm this recurring expense.</Note> : null}
      {view.busy ? <Note>Checking the proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before deciding.</Note>
          ) : null}
          <Section title="Proposed expense linkage">
            <Note>{manualCycleApprovalText(view.approval, view.context, actor)}</Note>
          </Section>
          <DecisionControls {...props} />
        </>
      ) : null}
      <NativeAction
        label="Reload current status"
        disabled={!view.active || !view.online || view.busy}
        onPress={() => void runtime.refresh()}
      />
    </Page>
  );
}
function Recorded({ view }: Pick<Props, "view">) {
  const router = useRouter();
  return (
    <Section title="Existing expense linked">
      <Note>
        The server linked the existing expense and consumed this cycle. No financial entry or
        payment was created. The future rule is unchanged.
      </Note>
      <NativeAction
        label="View current recurring expense"
        onPress={() =>
          router.push({
            pathname: "/recurring-rule",
            params: { ruleId: view.approval!.input.ruleId },
          })
        }
      />
    </Section>
  );
}
function DecisionControls({ runtime, view, actor }: Props) {
  const approval = view.approval!;
  const actions = manualCycleApprovalActions(view, useApprovalClock(approval.expiresAt));
  if (approval.status === "consumed") return <Recorded view={view} />;
  if (approval.status === "denied")
    return <Note>Proposal declined. It did not link this expense.</Note>;
  if (view.attempt)
    return (
      <Section title="Earlier decision">
        <Note>
          You chose to {view.attempt.approved ? "confirm" : "decline"} this exact proposal. Reload
          to check its outcome, or explicitly retry the same decision.
        </Note>
        <NativeAction
          label={view.attempt.approved ? "Retry confirmation" : "Retry decline"}
          disabled={!actions.retry}
          onPress={() => void runtime.retry()}
        />
      </Section>
    );
  const confirm = () => {
    if (!actions.confirm) return;
    Alert.alert(
      "Link this existing expense?",
      manualCycleApprovalText(approval, view.context, actor),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Link expense", onPress: () => void runtime.decide(approval, true) },
      ],
    );
  };
  const decline = () =>
    Alert.alert("Decline this proposal?", "This proposal will not link the expense.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline proposal",
        style: "destructive",
        onPress: () => void runtime.decide(approval, false),
      },
    ]);
  return (
    <Section title="Your decision">
      <Note>
        {actions.expired
          ? "This proposal has expired. Request a new proposal if you still want to link this expense."
          : "Confirm only after reviewing the exact rule, amount, payer and split above."}
      </Note>
      {!actions.confirm && actions.deny ? (
        <Note>
          The current rule or due cycle no longer matches. Decline and request a new review.
        </Note>
      ) : null}
      <NativeAction label="Link existing expense" disabled={!actions.confirm} onPress={confirm} />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}
