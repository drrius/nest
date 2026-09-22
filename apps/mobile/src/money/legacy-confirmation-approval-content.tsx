import { cycleExpenseTarget } from "./recurring-history-display";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useApprovalClock } from "./use-approval-clock";
import {
  legacyConfirmationApprovalActions,
  legacyConfirmationApprovalText,
} from "./legacy-confirmation-approval-display";
import type {
  LegacyConfirmationApprovalRuntime,
  LegacyConfirmationApprovalView,
} from "./legacy-confirmation-approval-runtime";
interface Props {
  runtime: LegacyConfirmationApprovalRuntime;
  view: LegacyConfirmationApprovalView;
  actor: string;
}
export function LegacyConfirmationApprovalContent(props: Props) {
  const { view, runtime, actor } = props;
  return (
    <Page>
      <Note>
        Private proposal · only your confirmation records this retained draft as an expense.
      </Note>
      {!view.online ? <Note>Connect to review or confirm this expense proposal.</Note> : null}
      {view.busy ? <Note>Checking the proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before deciding.</Note>
          ) : null}
          <Section title="Proposed expense proposal">
            <Note>{legacyConfirmationApprovalText(view.approval, view.context, actor)}</Note>
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
    <Section title="Expense recorded">
      <Note>
        The expense is recorded in shared Money. Its original draft remains in history. No payment
        was transferred and no future automatic expenses were authorized.
      </Note>
      <NativeAction
        label="View recorded financial event"
        onPress={() => router.push(cycleExpenseTarget(view.approval!.receipt!.eventId))}
      />
    </Section>
  );
}
function DecisionControls({ runtime, view, actor }: Props) {
  const approval = view.approval!;
  const actions = legacyConfirmationApprovalActions(view, useApprovalClock(approval.expiresAt));
  if (approval.status === "consumed") return <Recorded view={view} />;
  if (approval.status === "denied")
    return <Note>Proposal declined. It did not record an expense.</Note>;
  if (view.attempt) return <EarlierDecision {...{ runtime, view, actor }} />;
  const confirm = () => {
    if (!actions.confirm) return;
    Alert.alert(
      "Confirm and record this expense?",
      legacyConfirmationApprovalText(approval, view.context, actor),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm expense", onPress: () => void runtime.decide(approval, true) },
      ],
    );
  };
  const decline = () =>
    Alert.alert(
      "Decline this proposal?",
      "The server will decline this proposal unless its expense has already been recorded.",
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
          ? "This proposal has expired. Request a new proposal if you still want to record this expense."
          : "Confirm only after reviewing the original draft and proposed amount, payer, split, date, category and note above."}
      </Note>
      {!actions.confirm && actions.deny ? (
        <Note>The current draft no longer matches. Decline and request a new review.</Note>
      ) : null}
      <NativeAction label="Confirm expense" disabled={!actions.confirm} onPress={confirm} />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}

function EarlierDecision({ runtime, view }: Props) {
  const approval = view.approval!;
  const actions = legacyConfirmationApprovalActions(view, useApprovalClock(approval.expiresAt));
  const withdraw = () =>
    Alert.alert(
      "Withdraw unresolved confirmation?",
      "The expense may already be recorded. Nest will check the original operation and decline the proposal if confirmation has not completed. It cannot undo a recorded financial event.",
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
