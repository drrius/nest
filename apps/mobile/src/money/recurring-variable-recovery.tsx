import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { formatChf } from "./format";
import { variableRequestEnabled } from "./recurring-variable-confirmation";
import type {
  VariableCycleSaveRuntime,
  VariableCycleSaveView,
} from "./recurring-variable-save-runtime";
export function VariableSaveRecovery({
  runtime,
  view,
  next,
}: {
  runtime: VariableCycleSaveRuntime;
  view: VariableCycleSaveView;
  next: () => void;
}) {
  const router = useRouter(),
    result = view.result;
  if (result?.status === "recorded")
    return (
      <Section title="Variable bill recorded">
        <Note>
          {formatChf(result.receipt!.expense.amountCentimes)} · {result.receipt!.expense.date}
        </Note>
        <Note>
          This cycle is consumed. The expense stays in financial history. No payment was made.
        </Note>
        <NativeAction label="View Money history" onPress={() => router.push("/finances")} />
      </Section>
    );
  if (result?.status === "cancelled")
    return (
      <Section title="Request abandoned">
        <Note>
          This request cannot record an expense. Previously recorded expenses are unchanged.
        </Note>
        <NativeAction
          label="Reload current bill"
          onPress={next}
          disabled={!variableRequestEnabled(view) || view.attempt !== null}
        />
      </Section>
    );
  const attempt = view.attempt;
  if (!attempt) return null;
  return (
    <Section title="Earlier variable bill request">
      <Note>
        {formatChf(attempt.command.input.amountCentimes)} · {attempt.command.input.dueOn}
      </Note>
      <Note>Rule reference: {attempt.command.input.ruleId}</Note>
      <Note>
        Checking status never records another expense. Resolve this exact request before editing.
      </Note>
      <NativeAction
        label={attempt.action === "cancel" ? "Retry abandonment" : "Retry exact Save"}
        disabled={!variableRequestEnabled(view)}
        onPress={() => void runtime.retry()}
      />
      {attempt.action === "save" ? (
        <NativeAction
          label="Abandon this request"
          disabled={!variableRequestEnabled(view)}
          onPress={() =>
            Alert.alert(
              "Abandon this request?",
              "An already recorded expense remains. Otherwise this request will no longer be able to record the bill.",
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
