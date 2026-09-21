import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { RefundSaveRuntime, RefundSaveView } from "./refund-save-runtime";
import { formatChf } from "./format";
interface Props {
  runtime: RefundSaveRuntime;
  view: RefundSaveView;
  next: () => void;
  actor: string;
}
export function refundSaveEnabled(view: RefundSaveView) {
  return view.active && view.online && view.fresh && !view.busy;
}
export function RefundSaveStatus(props: Props) {
  const { view, next } = props;
  if (view.result?.status === "recorded") return <Recorded view={view} />;
  if (view.result?.status === "cancelled")
    return (
      <Section title="Save cancelled">
        <Note>
          This attempt cannot post a refund. You can edit your input and start a new Save.
        </Note>
        <NativeAction
          label="Return to refund form"
          disabled={!refundSaveEnabled(view) || view.attempt !== null}
          onPress={next}
        />
      </Section>
    );
  return view.attempt ? <Unresolved {...props} /> : null;
}
function Recorded({ view }: { view: RefundSaveView }) {
  const router = useRouter(),
    receipt = view.result!.receipt!;
  return (
    <Section title="Refund recorded">
      <Note>
        {receipt.refund.description} · {formatChf(receipt.refund.amountCentimes)}
      </Note>
      <Note>The server confirmed this refund. Its financial history is retained.</Note>
      <NativeAction
        label="View recorded refund"
        onPress={() =>
          router.push({ pathname: "/money-event", params: { eventId: receipt.eventId } })
        }
      />
    </Section>
  );
}
function Unresolved({ runtime, view, actor }: Props) {
  const router = useRouter();
  const attempt = view.attempt!,
    refund = attempt.command.refund,
    enabled = refundSaveEnabled(view);
  return (
    <Section title="Earlier refund attempt">
      <Note>
        {refund.description} · {formatChf(refund.amountCentimes)} · {refund.date}
      </Note>
      <NativeAction
        label="View original expense"
        onPress={() =>
          router.push({ pathname: "/money-event", params: { eventId: refund.sourceEventId } })
        }
      />
      <Note>Original payer: {refund.payerId === actor ? "you" : "your partner"}</Note>
      {refund.allocations.map((share) => (
        <Note key={share.memberId}>
          {share.memberId === actor ? "Your" : "Partner's"} refunded share:{" "}
          {formatChf(share.centimes)}
        </Note>
      ))}
      {refund.note ? <Note>{refund.note}</Note> : null}
      <Note>
        {attempt.action === "cancel"
          ? "Cancellation was requested. Check its outcome or explicitly retry cancellation."
          : "This exact refund is retained until its outcome is known. Checking status never resends it."}
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
