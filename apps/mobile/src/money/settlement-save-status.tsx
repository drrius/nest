import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { SettlementSaveRuntime, SettlementSaveView } from "./settlement-save-runtime";
import { formatChf } from "./format";
interface Props {
  runtime: SettlementSaveRuntime;
  view: SettlementSaveView;
  next: () => void;
  actor: string;
}
export function settlementSaveEnabled(view: SettlementSaveView) {
  return view.active && view.online && view.fresh && !view.busy;
}
export function SettlementSaveStatus(props: Props) {
  const { view, next } = props;
  if (view.result?.status === "recorded") return <Recorded view={view} />;
  if (view.result?.status === "cancelled")
    return (
      <Section title="Save cancelled">
        <Note>
          This attempt cannot post a settlement. You can edit your input and start a new Save.
        </Note>
        <NativeAction
          label="Return to settlement form"
          disabled={!settlementSaveEnabled(view) || view.attempt !== null}
          onPress={next}
        />
      </Section>
    );
  return view.attempt ? <Unresolved {...props} /> : null;
}
function Recorded({ view }: { view: SettlementSaveView }) {
  const router = useRouter(),
    receipt = view.result!.receipt!;
  return (
    <Section title="Settlement recorded">
      <Note>
        {receipt.settlement.description} · {formatChf(receipt.settlement.amountCentimes)}
      </Note>
      <Note>The server confirmed this settlement. Its financial history is retained.</Note>
      <NativeAction
        label="View recorded settlement"
        onPress={() =>
          router.push({ pathname: "/money-event", params: { eventId: receipt.eventId } })
        }
      />
    </Section>
  );
}
function Unresolved({ runtime, view, actor }: Props) {
  const attempt = view.attempt!,
    settlement = attempt.command.settlement,
    enabled = settlementSaveEnabled(view);
  return (
    <Section title="Earlier settlement attempt">
      <Note>
        {settlement.description} · {formatChf(settlement.amountCentimes)} · {settlement.date}
      </Note>
      <Note>Paid by {settlement.payerId === actor ? "you" : "your partner"}</Note>
      <Note>
        {settlement.mode === "full" ? "Full" : "Partial"} settlement · Reviewed outstanding{" "}
        {formatChf(settlement.expectedOutstandingCentimes)}
      </Note>
      <Note>Recipient: {settlement.recipientId === actor ? "you" : "your partner"}</Note>
      {settlement.note ? <Note>{settlement.note}</Note> : null}
      <Note>
        {attempt.action === "cancel"
          ? "Cancellation was requested. Check its outcome or explicitly retry cancellation."
          : "This exact settlement is retained until its outcome is known. Checking status never resends it."}
      </Note>
      <NativeAction
        label={attempt.action === "cancel" ? "Retry cancellation" : "Retry exact Save"}
        disabled={!enabled}
        onPress={() => void runtime.retry()}
      />
      {attempt.action === "save" ? (
        <NativeAction
          label="Cancel this Save"
          disabled={!enabled}
          onPress={() =>
            Alert.alert(
              "Cancel this Save?",
              "If it already recorded, Nest will show its receipt. Otherwise cancellation permanently prevents this attempt from posting.",
              [
                { text: "Keep checking", style: "cancel" },
                {
                  text: "Cancel Save",
                  style: "destructive",
                  onPress: () => void runtime.cancel(attempt),
                },
              ],
            )
          }
        />
      ) : null}
    </Section>
  );
}
