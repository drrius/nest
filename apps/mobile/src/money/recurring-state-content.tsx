import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import type { RecurringRule } from "@nest/contracts/recurring-read";
import type { RecurringStateInput } from "@nest/contracts/recurring-state";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type {
  RecurringStateSaveRuntime,
  RecurringStateSaveView,
} from "./recurring-state-save-runtime";
import {
  currentStateRule,
  prepareStateConfirmation,
  stateConfirmationCurrent,
  stateConfirmationText,
  stateRequestEnabled,
} from "./recurring-state-confirmation";
export function RecurringStateControls({
  read,
  save,
}: {
  read: RecurringReadRuntime;
  save: RecurringStateSaveRuntime;
}) {
  const rule = currentStateRule(read.getSnapshot(), save.getSnapshot());
  if (!rule)
    return <Note>Load current rule and request status online before making a decision.</Note>;
  if (rule.status === "cancelled")
    return <Note>This recurring rule is cancelled. Its financial history is retained.</Note>;
  const confirm = (action: RecurringStateInput["action"]) => {
    const expected = prepareStateConfirmation(rule, action, Crypto.randomUUID());
    if (!expected) return;
    Alert.alert(
      action === "pause" ? "Pause recurring expense?" : "Cancel recurring rule?",
      stateConfirmationText(rule, action),
      [
        { text: "Keep current rule", style: "cancel" },
        {
          text: action === "pause" ? "Pause rule" : "Cancel rule",
          style: "destructive",
          onPress: () => {
            if (stateConfirmationCurrent(expected, read.getSnapshot(), save.getSnapshot()))
              void save.save(expected.command);
          },
        },
      ],
    );
  };
  return (
    <Section title={rule.configuration.description}>
      <Note>Current status: {rule.status}</Note>
      <Note>Stopping a rule keeps all recorded expenses and financial history.</Note>
      {rule.status === "active" ? (
        <NativeAction label="Pause recurring rule" onPress={() => confirm("pause")} />
      ) : null}
      <NativeAction label="Cancel recurring rule" onPress={() => confirm("cancel")} />
    </Section>
  );
}
export function RecurringStateRecovery({
  runtime,
  view,
  next,
}: {
  runtime: RecurringStateSaveRuntime;
  view: RecurringStateSaveView;
  next: () => void;
}) {
  const result = view.result;
  if (result?.status === "recorded")
    return (
      <Section title={result.receipt!.status === "paused" ? "Rule paused" : "Rule cancelled"}>
        <Note>
          The server recorded this change. Existing financial history remains. Later changes may
          differ from this receipt.
        </Note>
        <RuleLink ruleId={result.receipt!.change.ruleId} />
      </Section>
    );
  if (result?.status === "cancelled")
    return (
      <Section title="Request abandoned">
        <Note>
          This request cannot pause or cancel a rule. No previously recorded change was reversed.
        </Note>
        <NativeAction
          label="Reload current rule"
          disabled={!stateRequestEnabled(view) || view.attempt !== null}
          onPress={next}
        />
      </Section>
    );
  return <Unresolved runtime={runtime} view={view} />;
}
function Unresolved({
  runtime,
  view,
}: {
  runtime: RecurringStateSaveRuntime;
  view: RecurringStateSaveView;
}) {
  const attempt = view.attempt;
  if (!attempt) return null;
  return (
    <Section title="Earlier state request">
      <Note>
        Requested action: {attempt.command.change.action}. Resolve this exact request before making
        another decision.
      </Note>
      <RuleLink ruleId={attempt.command.change.ruleId} />
      <Note>Checking status never sends the request again.</Note>
      <NativeAction
        label={attempt.action === "cancel" ? "Retry abandonment" : "Retry exact state request"}
        disabled={!stateRequestEnabled(view)}
        onPress={() => void runtime.retry()}
      />
      {attempt.action === "save" ? (
        <NativeAction
          label="Abandon this request"
          disabled={!stateRequestEnabled(view)}
          onPress={() =>
            Alert.alert(
              "Abandon this request?",
              "If the pause or cancellation is already recorded, it stays recorded. Otherwise this request will no longer be able to change the rule.",
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
function RuleLink({ ruleId }: { ruleId: RecurringRule["ruleId"] }) {
  const router = useRouter();
  return (
    <NativeAction
      label="View affected recurring rule"
      onPress={() => router.push({ pathname: "/recurring-rule", params: { ruleId } })}
    />
  );
}
