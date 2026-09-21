import { useApprovalClock } from "./use-approval-clock";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type {
  CorrectionApprovalRuntime,
  CorrectionApprovalView,
} from "./correction-approval-runtime";
import { approvalActions, correctionConfirmation } from "./correction-approval-display";
import { replacementReview } from "./correction-review";
interface Props {
  runtime: CorrectionApprovalRuntime;
  view: CorrectionApprovalView;
  actor: string;
}
export function CorrectionApprovalContent(props: Props) {
  const { view, runtime, actor } = props;
  return (
    <Page>
      <Note>Private correction proposal · only your confirmation records it in shared Money.</Note>
      {!view.online ? <Note>Connect to review or confirm this correction.</Note> : null}
      {view.busy ? <Note>Checking the correction proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before making a decision.</Note>
          ) : null}
          <CorrectionSummary view={view} actor={actor} />
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
function CorrectionSummary({ view, actor }: Pick<Props, "view" | "actor">) {
  const router = useRouter(),
    correction = view.approval!.correction;
  return (
    <Section title="Original and correction">
      <Note>
        {view.context
          ? correctionConfirmation(view.approval!, view.context, actor)
          : replacementReview(correction.replacement, actor)}
      </Note>
      <NativeAction
        label="View original entry"
        onPress={() =>
          router.push({ pathname: "/money-event", params: { eventId: correction.sourceEventId } })
        }
      />
      <Note>A changed original requires a new review. Its history is retained.</Note>
    </Section>
  );
}
function Recorded({ view }: Pick<Props, "view">) {
  const router = useRouter(),
    receipt = view.approval!.receipt!;
  const open = (eventId: string) => router.push({ pathname: "/money-event", params: { eventId } });
  return (
    <Section title="Correction recorded">
      <Note>
        The server confirmed this correction. Original and corrected history are retained.
      </Note>
      <NativeAction label="View reversal" onPress={() => open(receipt.reversalEventId)} />
      {receipt.replacementEventId ? (
        <NativeAction label="View replacement" onPress={() => open(receipt.replacementEventId!)} />
      ) : null}
    </Section>
  );
}
function DecisionControls({ runtime, view, actor }: Props) {
  const approval = view.approval!;
  const actions = approvalActions(view, useApprovalClock(approval.expiresAt));
  if (approval.status === "consumed") return <Recorded view={view} />;
  if (approval.status === "denied")
    return <Note>Proposal declined. This proposal did not post a correction.</Note>;
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
    if (!view.context || !actions.confirm) return;
    Alert.alert("Record this correction?", correctionConfirmation(approval, view.context!, actor), [
      { text: "Cancel", style: "cancel" },
      { text: "Record correction", onPress: () => void runtime.decide(approval, true) },
    ]);
  };
  const decline = () =>
    Alert.alert("Decline this proposal?", "This proposal will not record a correction.", [
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
          ? "This proposal has expired. Ask the assistant for a new proposal if you still want to record it."
          : "Review the original balance effect and exact replacement. Confirming updates shared history; Nest does not transfer money."}
      </Note>
      {!actions.confirm && actions.deny ? (
        <Note>The original has changed. Decline this proposal and request a new review.</Note>
      ) : null}
      <NativeAction
        label="Confirm and record correction"
        disabled={!actions.confirm}
        onPress={confirm}
      />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}
