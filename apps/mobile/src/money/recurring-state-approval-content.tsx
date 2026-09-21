import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useApprovalClock } from "./use-approval-clock";
import {
  recurringStateApprovalActions,
  recurringStateApprovalText,
} from "./recurring-state-approval-display";
import type {
  RecurringStateApprovalRuntime,
  RecurringStateApprovalView,
} from "./recurring-state-approval-runtime";
interface Props {
  runtime: RecurringStateApprovalRuntime;
  view: RecurringStateApprovalView;
}
export function RecurringStateApprovalContent(props: Props) {
  const { view, runtime } = props;
  return (
    <Page>
      <Note>
        Private proposal · only your confirmation changes the recurring rule in shared Money.
      </Note>
      {!view.online ? <Note>Connect to review or confirm this recurring expense.</Note> : null}
      {view.busy ? <Note>Checking the proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before deciding.</Note>
          ) : null}
          <Section title="Proposed recurring state change">
            <Note>{recurringStateApprovalText(view.approval, view.context)}</Note>
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
    <Section title="State change recorded">
      <Note>
        The server recorded this pause or cancellation. No expense was posted by this approval. The
        current rule may have changed since.
      </Note>
      <NativeAction
        label="View current recurring expense"
        onPress={() =>
          router.push({
            pathname: "/recurring-rule",
            params: { ruleId: view.approval!.change.ruleId },
          })
        }
      />
    </Section>
  );
}
function DecisionControls({ runtime, view }: Props) {
  const approval = view.approval!;
  const actions = recurringStateApprovalActions(view, useApprovalClock(approval.expiresAt));
  if (approval.status === "consumed") return <Recorded view={view} />;
  if (approval.status === "denied")
    return <Note>Proposal declined. It did not change the recurring rule.</Note>;
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
      "Apply this recurring state change?",
      recurringStateApprovalText(approval, view.context),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm change", onPress: () => void runtime.decide(approval, true) },
      ],
    );
  };
  const decline = () =>
    Alert.alert(
      "Decline this proposal?",
      "This proposal will not pause or cancel a recurring rule.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Decline proposal",
          style: "destructive",
          onPress: () => void runtime.decide(approval, false),
        },
      ],
    );
  return (
    <Section title="Your decision">
      <Note>
        {actions.expired
          ? "This proposal has expired. Request a new proposal if you still want this state change."
          : "Confirm only after reviewing the affected rule and pause or cancellation above."}
      </Note>
      {!actions.confirm && actions.deny ? (
        <Note>
          The current rule revision or status no longer matches. Decline and request a new review.
        </Note>
      ) : null}
      <NativeAction label="Confirm state change" disabled={!actions.confirm} onPress={confirm} />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}
