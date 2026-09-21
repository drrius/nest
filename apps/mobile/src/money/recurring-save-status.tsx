import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { RecurringSaveRuntime, RecurringSaveView } from "./recurring-save-runtime";
import { recurringConfirmationText } from "./recurring-confirmation";
interface Props {
  runtime: RecurringSaveRuntime;
  view: RecurringSaveView;
  actor: string;
  next: () => void;
}
export function RecurringSaveStatus({ runtime, view, actor, next }: Props) {
  const router = useRouter();
  const enabled = view.active && view.online && view.fresh && !view.busy && !view.verify;
  if (view.result?.status === "recorded")
    return (
      <Section title="Configuration saved">
        <Note>The server confirmed this configuration. No expense was posted by this Save.</Note>
        <NativeAction
          label="View recurring expense"
          onPress={() =>
            router.push({
              pathname: "/recurring-rule",
              params: { ruleId: view.result!.receipt!.rule.ruleId },
            })
          }
        />
      </Section>
    );
  if (view.result?.status === "cancelled")
    return (
      <Section title="Save cancelled">
        <Note>
          This attempt cannot change a recurring configuration. Existing rules are unchanged.
        </Note>
        <NativeAction
          label="Return to form"
          disabled={!enabled || view.attempt !== null}
          onPress={next}
        />
      </Section>
    );
  return <Unresolved runtime={runtime} view={view} actor={actor} next={next} />;
}
function Unresolved({ runtime, view, actor }: Props) {
  const enabled = view.active && view.online && view.fresh && !view.busy && !view.verify;
  const attempt = view.attempt;
  if (!attempt) return null;
  return (
    <Section title="Earlier recurring Save">
      <Note>{recurringConfirmationText(attempt.command, actor)}</Note>
      <Note>Checking status never resends a Save. Resolve this exact attempt before editing.</Note>
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
              "If already saved, its configuration remains. Otherwise cancellation prevents this attempt from changing a rule.",
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
