import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useApprovalClock } from "./use-approval-clock";
import {
  legacyAdoptionApprovalActions,
  legacyAdoptionApprovalText,
} from "./legacy-adoption-approval-display";
import type {
  LegacyAdoptionApprovalRuntime,
  LegacyAdoptionApprovalView,
} from "./legacy-adoption-approval-runtime";
interface Props {
  runtime: LegacyAdoptionApprovalRuntime;
  view: LegacyAdoptionApprovalView;
  actor: string;
}
export function LegacyAdoptionApprovalContent(props: Props) {
  const { view, runtime, actor } = props;
  return (
    <Page>
      <Note>
        Private proposal · only your approval adopts this rule and authorizes its new configuration.
      </Note>
      {!view.online ? <Note>Connect to review or confirm this adoption proposal.</Note> : null}
      {view.busy ? <Note>Checking the proposal…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.approval ? (
        <>
          {!view.fresh ? (
            <Note>Previously loaded proposal. Reload online before deciding.</Note>
          ) : null}
          <Section title="Proposed recurring adoption">
            <Note>{legacyAdoptionApprovalText(view.approval, view.context, actor)}</Note>
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
    <Section title="Rule adopted">
      <Note>
        The native configuration is saved. Original drafts and financial events remain in history.
        Adoption records no expense; fixed mode authorizes future automatic recording.
      </Note>
      <NativeAction
        label="View adopted rule"
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
  const actions = legacyAdoptionApprovalActions(view, useApprovalClock(approval.expiresAt));
  if (approval.status === "consumed") return <Recorded view={view} />;
  if (approval.status === "denied")
    return <Note>Proposal declined. It did not adopt the rule.</Note>;
  if (view.attempt) return <EarlierDecision {...{ runtime, view, actor }} />;
  const confirm = () => {
    if (!actions.confirm) return;
    Alert.alert(
      "Approve this recurring adoption?",
      legacyAdoptionApprovalText(approval, view.context, actor),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Approve adoption", onPress: () => void runtime.decide(approval, true) },
      ],
    );
  };
  const decline = () =>
    Alert.alert(
      "Decline this proposal?",
      "The server will decline this proposal unless adoption has already completed.",
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
          ? "This proposal has expired. Request a new proposal if you still want to adopt this rule."
          : "Confirm only after reviewing the original rule and proposed mode, amount, payer, split, schedule, category and note above."}
      </Note>
      {!actions.confirm && actions.deny ? (
        <Note>The current rule no longer matches. Decline and request a new review.</Note>
      ) : null}
      <NativeAction label="Approve adoption" disabled={!actions.confirm} onPress={confirm} />
      <NativeAction label="Decline proposal" disabled={!actions.deny} onPress={decline} />
    </Section>
  );
}

function EarlierDecision({ runtime, view }: Props) {
  const approval = view.approval!;
  const actions = legacyAdoptionApprovalActions(view, useApprovalClock(approval.expiresAt));
  const withdraw = () =>
    Alert.alert(
      "Withdraw unresolved confirmation?",
      "Adoption may already be complete. Nest will check the original operation and decline the proposal if approval has not completed. Withdrawal cannot undo a committed adoption.",
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
