import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { dismissalRequestEnabled } from "./legacy-dismissal-confirmation";
import { legacyDescription } from "./legacy-recurring-display";
import type {
  LegacyDismissalSaveRuntime,
  LegacyDismissalSaveView,
} from "./legacy-dismissal-save-runtime";
export function DismissalRecovery({
  runtime,
  view,
  next,
}: {
  runtime: LegacyDismissalSaveRuntime;
  view: LegacyDismissalSaveView;
  next: () => void;
}) {
  const router = useRouter(),
    result = view.result;
  if (result?.status === "recorded")
    return (
      <Section title="Draft dismissed">
        <Note>{legacyDescription(result.receipt!.reviewed.draft.description)}</Note>
        <Note>
          The draft stays in history. No expense, payment or balance change was created. The
          recurring rule stays unchanged.
        </Note>
        <NativeAction
          label="View retained drafts"
          onPress={() =>
            router.push({
              pathname: "/legacy-recurring-drafts",
              params: { ruleId: result.receipt!.input.ruleId },
            })
          }
        />
      </Section>
    );
  if (result?.status === "cancelled")
    return (
      <Section title="Request abandoned">
        <Note>This request cannot dismiss the draft. Reload to review its current state.</Note>
        <NativeAction
          label="Reload current draft"
          onPress={next}
          disabled={!dismissalRequestEnabled(view) || view.attempt !== null}
        />
      </Section>
    );
  const attempt = view.attempt;
  if (!attempt) return null;
  return (
    <Section title="Earlier dismissal request">
      <Note>Draft reference: {attempt.command.input.draftId}</Note>
      <Note>Rule reference: {attempt.command.input.ruleId}</Note>
      <Note>
        Check this exact saved request before starting another dismissal. Checking never changes a
        draft.
      </Note>
      <NativeAction
        label={attempt.action === "cancel" ? "Retry abandonment" : "Retry exact dismissal"}
        disabled={!dismissalRequestEnabled(view)}
        onPress={() => void runtime.retry()}
      />
      {attempt.action === "save" ? (
        <NativeAction
          label="Abandon this request"
          disabled={!dismissalRequestEnabled(view)}
          onPress={() =>
            Alert.alert(
              "Abandon this request?",
              "An already dismissed draft stays dismissed. Otherwise this request will no longer be able to dismiss it.",
              [
                { text: "Keep checking", style: "cancel" },
                {
                  text: "Abandon request",
                  style: "destructive",
                  onPress: () => void runtime.abandon(attempt),
                },
              ],
            )
          }
        />
      ) : null}
    </Section>
  );
}
