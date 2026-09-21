import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { CorrectionSaveRuntime, CorrectionSaveView } from "./correction-save-runtime";
import { replacementReview } from "./correction-review";
interface Props {
  runtime: CorrectionSaveRuntime;
  view: CorrectionSaveView;
  next: () => void;
  actor: string;
}
export function correctionSaveEnabled(view: CorrectionSaveView) {
  return view.active && view.online && view.fresh && !view.busy;
}
export function CorrectionSaveStatus(props: Props) {
  const { view, next } = props;
  if (view.result?.status === "recorded") return <Recorded view={view} />;
  if (view.result?.status === "cancelled")
    return (
      <Section title="Save cancelled">
        <Note>
          This attempt cannot post a correction. You can edit your input and start a new Save.
        </Note>
        <NativeAction
          label="Return to correction form"
          disabled={!correctionSaveEnabled(view) || view.attempt !== null}
          onPress={next}
        />
      </Section>
    );
  return view.attempt ? <Unresolved {...props} /> : null;
}
function Recorded({ view }: { view: CorrectionSaveView }) {
  const router = useRouter(),
    receipt = view.result!.receipt!;
  const open = (eventId: string) => router.push({ pathname: "/money-event", params: { eventId } });
  return (
    <Section title="Correction recorded">
      <Note>
        The server confirmed this correction. The original and its reversal remain in history.
      </Note>
      <NativeAction
        label="View original entry"
        onPress={() => open(receipt.correction.sourceEventId)}
      />
      <NativeAction label="View reversal" onPress={() => open(receipt.reversalEventId)} />
      {receipt.replacementEventId ? (
        <NativeAction label="View replacement" onPress={() => open(receipt.replacementEventId!)} />
      ) : null}
    </Section>
  );
}
function Unresolved({ runtime, view, actor }: Props) {
  const router = useRouter(),
    attempt = view.attempt!,
    input = attempt.command.correction,
    enabled = correctionSaveEnabled(view);
  const replacement = input.replacement;
  return (
    <Section title="Earlier correction attempt">
      <Note>
        {replacement
          ? "Reverse and replace the original entry."
          : "Reverse the original without a replacement."}
      </Note>
      <NativeAction
        label="View original entry"
        onPress={() =>
          router.push({ pathname: "/money-event", params: { eventId: input.sourceEventId } })
        }
      />
      <Note>{replacementReview(replacement, actor)}</Note>
      <Note>
        {attempt.action === "cancel"
          ? "Cancellation was requested. Check its outcome or explicitly retry cancellation."
          : "This exact correction is retained until its outcome is known. Checking status never resends it."}
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
