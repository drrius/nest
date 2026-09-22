import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { adoptionRequestEnabled } from "./legacy-adoption-context";
import { adoptionConfirmationText } from "./legacy-adoption-summary";
import type {
  LegacyAdoptionSaveRuntime,
  LegacyAdoptionSaveView,
} from "./legacy-adoption-save-runtime";
export function AdoptionRecovery({
  runtime,
  view,
  next,
  actor,
}: {
  runtime: LegacyAdoptionSaveRuntime;
  view: LegacyAdoptionSaveView;
  next: () => void;
  actor: string;
}) {
  const router = useRouter(),
    result = view.result;
  if (result?.status === "recorded")
    return (
      <Section title="Recurring rule adopted">
        <Note>
          The reviewed configuration is saved and the old generator is stopped. Original drafts and
          financial history are retained. Adoption itself records no expense.
        </Note>
        <Note>
          {adoptionConfirmationText(
            { operationId: result.operationId, input: result.receipt!.input },
            actor,
            result.receipt!.reviewed.coveredThrough,
          )}
        </Note>
        <NativeAction
          label="View adopted recurring rule"
          onPress={() =>
            router.push({
              pathname: "/recurring-rule",
              params: { ruleId: result.receipt!.input.ruleId },
            })
          }
        />
      </Section>
    );
  if (result?.status === "cancelled")
    return (
      <Section title="Adoption request abandoned">
        <Note>This request cannot adopt the rule. Reload to review its current state.</Note>
        <NativeAction
          label="Reload current rule"
          onPress={next}
          disabled={!adoptionRequestEnabled(view) || view.attempt !== null}
        />
      </Section>
    );
  return <EarlierAdoption runtime={runtime} view={view} actor={actor} />;
}
function EarlierAdoption({
  runtime,
  view,
  actor,
}: {
  runtime: LegacyAdoptionSaveRuntime;
  view: LegacyAdoptionSaveView;
  actor: string;
}) {
  const attempt = view.attempt;
  if (!attempt) return null;
  return (
    <Section title="Earlier adoption request">
      <Note>{adoptionConfirmationText(attempt.command, actor, undefined)}</Note>
      <Note>
        First new cycle: {attempt.command.input.firstDueOn}. Check or retry this exact saved request
        before starting another adoption. Checking does not grant a mandate.
      </Note>
      <NativeAction
        label={attempt.action === "cancel" ? "Retry abandonment" : "Retry exact adoption"}
        disabled={!adoptionRequestEnabled(view)}
        onPress={() => void runtime.retry()}
      />
      {attempt.action === "save" ? (
        <NativeAction
          label="Abandon this request"
          disabled={!adoptionRequestEnabled(view)}
          onPress={() =>
            Alert.alert(
              "Abandon adoption request?",
              "An already granted mandate remains active. Otherwise this request can no longer adopt the rule.",
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
