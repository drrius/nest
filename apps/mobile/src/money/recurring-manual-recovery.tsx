import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { formatChf } from "./format";
import { manualRequestEnabled } from "./recurring-manual-confirmation";
import type { ManualCycleSaveRuntime, ManualCycleSaveView } from "./recurring-manual-save-runtime";
export function ManualSaveRecovery({
  runtime,
  view,
  next,
}: {
  runtime: ManualCycleSaveRuntime;
  view: ManualCycleSaveView;
  next: () => void;
}) {
  const router = useRouter(),
    result = view.result;
  if (result?.status === "recorded")
    return (
      <Section title="Existing expense linked">
        <Note>
          {formatChf(result.receipt!.linkedExpense.event.amountCentimes)} ·{" "}
          {result.receipt!.linkedExpense.event.occurredOn}
        </Note>
        <Note>
          This cycle is consumed. The original expense stays in history. No expense or payment was
          created.
        </Note>
        <NativeAction label="View Money history" onPress={() => router.push("/finances")} />
      </Section>
    );
  if (result?.status === "cancelled")
    return (
      <Section title="Request abandoned">
        <Note>This request cannot link the expense. Existing expenses are unchanged.</Note>
        <NativeAction
          label="Reload current bill"
          onPress={next}
          disabled={!manualRequestEnabled(view) || view.attempt !== null}
        />
      </Section>
    );
  const attempt = view.attempt;
  if (!attempt) return null;
  return (
    <Section title="Earlier linking request">
      <Note>
        Expense reference: {attempt.command.input.sourceEventId} · {attempt.command.input.dueOn}
      </Note>
      <Note>Rule reference: {attempt.command.input.ruleId}</Note>
      <Note>
        Checking status never records another expense. Resolve this exact request before editing.
      </Note>
      <NativeAction
        label={attempt.action === "cancel" ? "Retry abandonment" : "Retry exact Save"}
        disabled={!manualRequestEnabled(view)}
        onPress={() => void runtime.retry()}
      />
      {attempt.action === "save" ? (
        <NativeAction
          label="Abandon this request"
          disabled={!manualRequestEnabled(view)}
          onPress={() =>
            Alert.alert(
              "Abandon this request?",
              "An already linked cycle remains consumed. Otherwise this request will no longer be able to link the expense.",
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
