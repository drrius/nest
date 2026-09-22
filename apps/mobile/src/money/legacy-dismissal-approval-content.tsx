import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useApprovalClock } from "./use-approval-clock";
import {
  legacyDismissalApprovalActions,
  legacyDismissalApprovalText,
} from "./legacy-dismissal-approval-display";
import type {
  LegacyDismissalApprovalRuntime,
  LegacyDismissalApprovalView,
} from "./legacy-dismissal-approval-runtime";
interface Props {
  runtime: LegacyDismissalApprovalRuntime;
  view: LegacyDismissalApprovalView;
  actor: string;
}
export function LegacyDismissalApprovalContent(props: Props) {
  const { view, runtime, actor } = props;
  return (
    <Page>
      <Note>Private proposal · only your confirmation dismisses this unposted legacy draft.</Note>
      {!view.online ? <Note>Connect to review or confirm this draft dismissal.</Note> : null}
      {view.busy ? <Note>Checking the proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before deciding.</Note>
          ) : null}
          <Section title="Proposed draft dismissal">
            <Note>{legacyDismissalApprovalText(view.approval, view.context, actor)}</Note>
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
    <Section title="Draft dismissed">
      <Note>
        The server dismissed the draft. It remains in history. No expense or payment was recorded,
        no balance changed, and the recurring rule is unchanged.
      </Note>
      <NativeAction
        label="View retained drafts"
        onPress={() =>
          router.push({
            pathname: "/legacy-recurring-drafts",
            params: { ruleId: view.approval!.input.ruleId },
          })
        }
      />
    </Section>
  );
}
function DecisionControls({ runtime, view, actor }: Props) {
  const approval = view.approval!;
  const actions = legacyDismissalApprovalActions(view, useApprovalClock(approval.expiresAt));
  if (approval.status === "consumed") return <Recorded view={view} />;
  if (approval.status === "denied")
    return <Note>Proposal declined. It did not dismiss the draft.</Note>;
  if (view.attempt) return <EarlierDecision {...{ runtime, view, actor }} />;
  const confirm = () => {
    if (!actions.confirm) return;
    Alert.alert("Dismiss this draft?", legacyDismissalApprovalText(approval, view.context, actor), [
      { text: "Cancel", style: "cancel" },
      { text: "Dismiss draft", onPress: () => void runtime.decide(approval, true) },
    ]);
  };
  const decline = () =>
    Alert.alert(
      "Decline this proposal?",
      "The server will decline this proposal unless its dismissal has already completed.",
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
          ? "This proposal has expired. Request a new proposal if you still want to dismiss this draft."
          : "Confirm only after reviewing the exact rule, amount, payer and split above."}
      </Note>
      {!actions.confirm && actions.deny ? (
        <Note>The current draft no longer matches. Decline and request a new review.</Note>
      ) : null}
      <NativeAction label="Dismiss draft" disabled={!actions.confirm} onPress={confirm} />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}

function EarlierDecision({ runtime, view }: Props) {
  const approval = view.approval!;
  const actions = legacyDismissalApprovalActions(view, useApprovalClock(approval.expiresAt));
  const withdraw = () =>
    Alert.alert(
      "Withdraw unresolved confirmation?",
      "The draft may already be dismissed. Nest will check the original operation and decline the proposal if dismissal has not completed. It cannot undo a completed dismissal.",
      [
        { text: "Keep checking", style: "cancel" },
        {
          text: "Withdraw confirmation",
          style: "destructive",
          onPress: () => void runtime.withdraw(approval),
        },
      ],
    );
  return (
    <Section title="Earlier decision">
      <Note>
        You chose to {view.attempt!.approved ? "confirm" : "decline"} this exact proposal. Reload to
        check its outcome, or explicitly retry the same decision. Leaving does not cancel it.
      </Note>
      <NativeAction
        label={view.attempt!.approved ? "Retry confirmation" : "Retry decline"}
        disabled={!actions.retry}
        onPress={() => void runtime.retry()}
      />
      {view.attempt!.approved ? (
        <NativeAction
          label="Withdraw unresolved confirmation"
          disabled={!actions.withdraw}
          onPress={withdraw}
        />
      ) : null}
    </Section>
  );
}
