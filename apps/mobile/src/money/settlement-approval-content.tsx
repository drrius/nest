import { useApprovalClock } from "./use-approval-clock";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type {
  SettlementApprovalRuntime,
  SettlementApprovalView,
} from "./settlement-approval-runtime";
import {
  approvalActions,
  settlementConfirmation,
  memberLabel,
} from "./settlement-approval-display";
import { formatChf } from "./format";
interface Props {
  runtime: SettlementApprovalRuntime;
  view: SettlementApprovalView;
  actor: string;
}
export function SettlementApprovalContent(props: Props) {
  const { view, runtime, actor } = props;
  return (
    <Page>
      <Note>Private settlement proposal · only your confirmation records it in shared Money.</Note>
      {!view.online ? <Note>Connect to review or confirm this settlement.</Note> : null}
      {view.busy ? <Note>Checking the settlement proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before making a decision.</Note>
          ) : null}
          <SettlementSummary view={view} actor={actor} />
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
function SettlementSummary({ view, actor }: Pick<Props, "view" | "actor">) {
  const settlement = view.approval!.settlement;
  return (
    <>
      <Section title={settlement.description}>
        <Note>
          {formatChf(settlement.amountCentimes)} · {settlement.date}
        </Note>
        <Note>
          {memberLabel(settlement.payerId, actor)} → {memberLabel(settlement.recipientId, actor)}
        </Note>
        <Note>{settlement.mode === "full" ? "Full settlement" : "Partial settlement"}</Note>
        <Note>
          Reviewed outstanding balance: {formatChf(settlement.expectedOutstandingCentimes)}
        </Note>
        <Note>A changed balance requires a new review. Nest does not transfer money.</Note>
      </Section>
      {settlement.note !== null ? (
        <Section title="Note">
          <Note>{settlement.note}</Note>
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
      <Section title="Settlement recorded">
        <Note>The server confirmed this settlement. Its financial history is retained.</Note>
        <NativeAction
          label="View recorded settlement"
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
    return <Note>Proposal declined. This proposal did not post a settlement.</Note>;
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
    Alert.alert("Record this settlement?", settlementConfirmation(approval, actor), [
      { text: "Cancel", style: "cancel" },
      { text: "Record settlement", onPress: () => void runtime.decide(approval, true) },
    ]);
  const decline = () =>
    Alert.alert("Decline this proposal?", "This proposal will not record a settlement.", [
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
          : "Review the exact payer, recipient and amount. Recording updates your shared balance; Nest does not transfer money."}
      </Note>
      <NativeAction
        label="Confirm and record settlement"
        disabled={!actions.confirm}
        onPress={confirm}
      />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}
