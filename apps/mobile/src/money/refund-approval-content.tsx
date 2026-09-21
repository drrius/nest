import { useApprovalClock } from "./use-approval-clock";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { RefundApprovalRuntime, RefundApprovalView } from "./refund-approval-runtime";
import { approvalActions, refundConfirmation, memberLabel } from "./refund-approval-display";
import { formatChf } from "./format";
interface Props {
  runtime: RefundApprovalRuntime;
  view: RefundApprovalView;
  actor: string;
}
export function RefundApprovalContent(props: Props) {
  const { view, runtime, actor } = props;
  return (
    <Page>
      <Note>Private refund proposal · only your confirmation records it in shared Money.</Note>
      {!view.online ? <Note>Connect to review or confirm this refund.</Note> : null}
      {view.busy ? <Note>Checking the refund proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before making a decision.</Note>
          ) : null}
          <RefundSummary view={view} actor={actor} />
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
function RefundSummary({ view, actor }: Pick<Props, "view" | "actor">) {
  const router = useRouter(),
    refund = view.approval!.refund;
  return (
    <>
      <Section title={refund.description}>
        <Note>
          {formatChf(refund.amountCentimes)} · {refund.date}
        </Note>
        <Note>Original payer: {memberLabel(refund.payerId, actor)}</Note>
        {refund.allocations.map((share) => (
          <Note key={share.memberId}>
            {memberLabel(share.memberId, actor)} · Refund: {formatChf(share.centimes)}
          </Note>
        ))}
        {refund.expectedRemaining.map((share) => (
          <Note key={share.memberId}>
            {memberLabel(share.memberId, actor)} · Reviewed remaining: {formatChf(share.centimes)}
          </Note>
        ))}
        <NativeAction
          label="View original expense"
          onPress={() =>
            router.push({ pathname: "/money-event", params: { eventId: refund.sourceEventId } })
          }
        />
        <Note>
          A changed original or remaining share requires a new review. Record only refunds already
          received outside Nest.
        </Note>
      </Section>
      {refund.note !== null ? (
        <Section title="Note">
          <Note>{refund.note}</Note>
        </Section>
      ) : null}
    </>
  );
}
function DecisionControls({ runtime, view, actor }: Props) {
  const router = useRouter(),
    approval = view.approval!;
  const actions = approvalActions(view, useApprovalClock(approval.expiresAt));
  if (approval.status === "consumed")
    return (
      <Section title="Refund recorded">
        <Note>The server confirmed this refund. Its financial history is retained.</Note>
        <NativeAction
          label="View recorded refund"
          onPress={() =>
            router.push({
              pathname: "/money-event",
              params: { eventId: approval.receipt!.eventId },
            })
          }
        />
      </Section>
    );
  if (approval.status === "denied")
    return <Note>Proposal declined. This proposal did not post a refund.</Note>;
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
  const confirm = () =>
    Alert.alert("Record this refund?", refundConfirmation(approval, actor), [
      { text: "Cancel", style: "cancel" },
      { text: "Record refund", onPress: () => void runtime.decide(approval, true) },
    ]);
  const decline = () =>
    Alert.alert("Decline this proposal?", "This proposal will not record a refund.", [
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
          : "Review the original expense, payer, amount and each refunded share. Confirming updates shared history; Nest does not transfer money."}
      </Note>
      <NativeAction
        label="Confirm and record refund"
        disabled={!actions.confirm}
        onPress={confirm}
      />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}
