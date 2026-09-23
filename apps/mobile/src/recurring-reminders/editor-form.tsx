import { useLayoutEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import type { ReminderEditorContext } from "./editor-context";
import type { useReminderEditorContext } from "./use-editor-context";
import type { RecurringReminderSaveRuntime } from "./save-runtime";
import { reminderDraft, parseReminderDraft } from "./form";
import { useReminderFields } from "./use-fields";
import { ReminderFieldsView } from "./fields";
import { reminderConfirmation } from "./confirmation";
import { useLeaveReminder } from "./use-leave-editor";
import { Note } from "../components/page";
import { NativeAction } from "../components/native-action";
type Props = {
  runtime: RecurringReminderSaveRuntime;
  context: ReturnType<typeof useReminderEditorContext>;
  ruleId: string;
};
export function ReminderEditorForm(props: Props) {
  const [initial, setInitial] = useState<ReminderEditorContext | null>(null);
  if (!initial && props.context.fresh && props.context.value) {
    setInitial(props.context.value);
    return null;
  }
  if (!initial) return <Note>Loading reminder and household…</Note>;
  return <Form {...props} initial={initial} />;
}
function Form(props: Props & { initial: ReminderEditorContext }) {
  const { initial, context, runtime } = props;
  const [operationId] = useState(() => Crypto.randomUUID());
  const fields = useReminderFields(reminderDraft(initial.reminder));
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0),
    latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  }, [props]);
  useLayoutEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  useLeaveReminder(
    runtime,
    () => JSON.stringify(fields.read()) !== JSON.stringify(reminderDraft(initial.reminder)),
    () => {
      epoch.current++;
    },
  );
  const allowed = () => canSave(latest.current.context, initial, runtime);
  const enabled = canSave(context, initial, runtime);
  const submit = () => {
    const settings = parseReminderDraft(fields.read());
    if (!settings)
      return setError("Choose recipients and enter a valid HH:MM time and 0–730 days.");
    const current = latest.current.context.value;
    if (!allowed() || !current) return setError("Reload the current reminder before saving.");
    const captured = epoch.current;
    const dialog = reminderConfirmation(
      {
        operationId,
        ruleId: initial.rule.ruleId,
        expectedRuleRevision: initial.rule.revision,
        expectedDueOn: initial.rule.nextDueOn!,
        expectedRevision: initial.reminder?.revision ?? null,
        settings,
      },
      current,
      () => captured === epoch.current && allowed(),
      runtime.save,
    );
    if (!dialog) return setError("The reminder or recipients changed. Reload before saving.");
    setError(null);
    Alert.alert("Save reminder settings?", dialog.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Save reminder",
        onPress: () => {
          void dialog.confirm();
        },
      },
    ]);
  };
  if (!runtime.getSnapshot().active)
    return <Note>Reminder details are hidden while inactive.</Note>;
  return (
    <>
      <ReminderFieldsView fields={fields} context={context.value ?? initial} disabled={!enabled} />
      {!enabled ? (
        <Note>
          Reload before saving. If settings changed, reopen the editor to review the latest version.
        </Note>
      ) : null}
      {error ? <Note>{error}</Note> : null}
      <NativeAction label="Review and save reminder" disabled={!enabled} onPress={submit} />
    </>
  );
}
function canSave(
  context: Props["context"],
  initial: ReminderEditorContext,
  runtime: RecurringReminderSaveRuntime,
) {
  const view = runtime.getSnapshot();
  if (!view.active || !view.online || !view.fresh || view.busy || view.attempt || view.result)
    return false;
  return matching(context, initial);
}
function matching(context: Props["context"], initial: ReminderEditorContext) {
  const value = context.value;
  if (!context.fresh || !value) return false;
  return (
    editableRule(value) &&
    value.rule.revision === initial.rule.revision &&
    value.rule.nextDueOn === initial.rule.nextDueOn &&
    (value.reminder?.revision ?? null) === (initial.reminder?.revision ?? null)
  );
}

function editableRule(value: ReminderEditorContext) {
  return value.rule.status === "active" && value.rule.nextDueOn !== null;
}
