import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useApprovalClock } from "./use-approval-clock";
import { recurringApprovalActions, recurringApprovalText } from "./recurring-approval-display";
import type { RecurringApprovalRuntime, RecurringApprovalView } from "./recurring-approval-runtime";
interface Props {
  runtime: RecurringApprovalRuntime;
  view: RecurringApprovalView;
  actor: string;
}
export function RecurringApprovalContent(props: Props) {
  const { view, runtime, actor } = props;
  return (
    <Page>
      <Note>
        Private proposal · only your confirmation saves this configuration in shared Money.
      </Note>
      {!view.online ? <Note>Connect to review or confirm this recurring expense.</Note> : null}
      {view.busy ? <Note>Checking the proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before deciding.</Note>
          ) : null}
          <Section title="Exact recurring configuration">
            <Note>{recurringApprovalText(view.approval, view.context, actor)}</Note>
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
    <Section title="Configuration saved">
      <Note>
        The server confirmed this configuration. No expense was posted by this approval. The current
        rule may have changed since.
      </Note>
      <NativeAction
        label="View current recurring expense"
        onPress={() =>
          router.push({
            pathname: "/recurring-rule",
            params: { ruleId: view.approval!.rule.ruleId },
          })
        }
      />
    </Section>
  );
}
function DecisionControls({ runtime, view, actor }: Props) {
  const approval = view.approval!;
  const actions = recurringApprovalActions(view, useApprovalClock(approval.expiresAt));
  if (approval.status === "consumed") return <Recorded view={view} />;
  if (approval.status === "denied")
    return <Note>Proposal declined. It did not save a recurring configuration.</Note>;
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
      "Save this recurring configuration?",
      recurringApprovalText(approval, view.context, actor),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm and save", onPress: () => void runtime.decide(approval, true) },
      ],
    );
  };
  const decline = () =>
    Alert.alert(
      "Decline this proposal?",
      "This proposal will not save a recurring configuration.",
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
          ? "This proposal has expired. Request a new proposal if you still want this configuration."
          : "Confirm only after reviewing the exact amount, payer, shares, cadence and start date above."}
      </Note>
      {!actions.confirm && actions.deny ? (
        <Note>
          The current configuration, category or eligible dates no longer match. Decline and request
          a new review.
        </Note>
      ) : null}
      <NativeAction
        label="Confirm and save configuration"
        disabled={!actions.confirm}
        onPress={confirm}
      />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}
