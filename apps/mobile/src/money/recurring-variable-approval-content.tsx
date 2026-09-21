import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useApprovalClock } from "./use-approval-clock";
import {
  variableCycleApprovalActions,
  variableCycleApprovalText,
} from "./recurring-variable-approval-display";
import type {
  VariableCycleApprovalRuntime,
  VariableCycleApprovalView,
} from "./recurring-variable-approval-runtime";
interface Props {
  runtime: VariableCycleApprovalRuntime;
  view: VariableCycleApprovalView;
  actor: string;
}
export function VariableCycleApprovalContent(props: Props) {
  const { view, runtime, actor } = props;
  return (
    <Page>
      <Note>
        Private proposal · only your confirmation records this variable bill in shared Money.
      </Note>
      {!view.online ? <Note>Connect to review or confirm this recurring expense.</Note> : null}
      {view.busy ? <Note>Checking the proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before deciding.</Note>
          ) : null}
          <Section title="Proposed variable bill">
            <Note>{variableCycleApprovalText(view.approval, view.context, actor)}</Note>
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
    <Section title="Variable bill recorded">
      <Note>
        The server recorded this expense and consumed this cycle. The mandate is unchanged. No
        payment was made.
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
  const actions = variableCycleApprovalActions(view, useApprovalClock(approval.expiresAt));
  if (approval.status === "consumed") return <Recorded view={view} />;
  if (approval.status === "denied")
    return <Note>Proposal declined. It did not record an expense.</Note>;
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
      "Record this variable bill?",
      variableCycleApprovalText(approval, view.context, actor),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Record expense", onPress: () => void runtime.decide(approval, true) },
      ],
    );
  };
  const decline = () =>
    Alert.alert("Decline this proposal?", "This proposal will not record an expense.", [
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
          ? "This proposal has expired. Request a new proposal if you still want to record this bill."
          : "Confirm only after reviewing the exact rule, amount, payer and split above."}
      </Note>
      {!actions.confirm && actions.deny ? (
        <Note>
          The current rule or due cycle no longer matches. Decline and request a new review.
        </Note>
      ) : null}
      <NativeAction label="Record variable bill" disabled={!actions.confirm} onPress={confirm} />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}
