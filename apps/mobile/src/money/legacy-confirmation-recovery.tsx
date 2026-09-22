import { cycleExpenseTarget } from "./recurring-history-display";
import { savedLegacyExpenseText } from "./legacy-confirmation-summary";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { legacyConfirmationRequestEnabled } from "./legacy-confirmation-context";
import { legacyDescription } from "./legacy-recurring-display";
import type {
  LegacyConfirmationSaveRuntime,
  LegacyConfirmationSaveView,
} from "./legacy-confirmation-save-runtime";
export function ConfirmationRecovery({
  runtime,
  view,
  next,
  actor,
}: {
  runtime: LegacyConfirmationSaveRuntime;
  view: LegacyConfirmationSaveView;
  next: () => void;
  actor: string;
}) {
  const router = useRouter(),
    result = view.result;
  if (result?.status === "recorded")
    return (
      <Section title="Expense recorded">
        <Note>{legacyDescription(result.receipt!.input.expense.description)}</Note>
        <Note>
          The original draft stays in history. The expense updates shared Money; no payment was
          transferred and no future automatic expenses were authorized.
        </Note>
        <NativeAction
          label="View recorded financial event"
          onPress={() => router.push(cycleExpenseTarget(result.receipt!.eventId))}
        />
      </Section>
    );
  if (result?.status === "cancelled")
    return (
      <Section title="Request abandoned">
        <Note>This request cannot confirm the draft. Reload to review its current state.</Note>
        <NativeAction
          label="Reload current draft"
          onPress={next}
          disabled={!legacyConfirmationRequestEnabled(view) || view.attempt !== null}
        />
      </Section>
    );
  const attempt = view.attempt;
  if (!attempt) return null;
  return (
    <Section title="Earlier confirmation request">
      <Note>Draft reference: {attempt.command.input.draftId}</Note>
      <Note>Rule reference: {attempt.command.input.ruleId}</Note>
      <Note>{savedLegacyExpenseText(attempt.command.input.expense, actor)}</Note>
      <Note>
        Check this exact saved request before starting another confirmation. Checking never changes
        a draft.
      </Note>
      <NativeAction
        label={attempt.action === "cancel" ? "Retry abandonment" : "Retry exact confirmation"}
        disabled={!legacyConfirmationRequestEnabled(view)}
        onPress={() => void runtime.retry()}
      />
      {attempt.action === "save" ? (
        <NativeAction
          label="Abandon this request"
          disabled={!legacyConfirmationRequestEnabled(view)}
          onPress={() =>
            Alert.alert(
              "Abandon this request?",
              "An already recorded expense stays in history. Otherwise this request will no longer be able to record it.",
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
