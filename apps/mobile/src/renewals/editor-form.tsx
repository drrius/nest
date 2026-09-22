import { useLeaveRenewal } from "./use-leave-editor";
import { confirmRenewalRemoval } from "./remove-confirmation";
import { useLayoutEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import type { RenewalEditorContext } from "./editor-context";
import type { useRenewalEditorContext } from "./use-editor-context";
import type { RenewalSaveRuntime } from "./save-runtime";
import { renewalDraft, parseRenewalDraft } from "./form";
import { useRenewalFields } from "./use-fields";
import { RenewalFieldsView } from "./fields";
import { renewalConfirmation } from "./confirmation";
import { Note } from "../components/page";
import { NativeAction } from "../components/native-action";
type Props = {
  runtime: RenewalSaveRuntime;
  context: ReturnType<typeof useRenewalEditorContext>;
  renewalId: string | null;
};
export function RenewalEditorForm(props: Props) {
  const [initial, setInitial] = useState<RenewalEditorContext | null>(null);
  if (!initial && props.context.fresh && props.context.value) {
    setInitial(props.context.value);
    return null;
  }
  if (!initial) return <Note>Loading renewal and household…</Note>;
  return <Form {...props} initial={initial} />;
}
function Form(props: Props & { initial: RenewalEditorContext }) {
  const { initial, context, runtime } = props;
  const [identity] = useState(() => ({
    renewalId: props.renewalId ?? Crypto.randomUUID(),
    operationId: Crypto.randomUUID(),
  }));
  const baseline = renewalDraft(initial.renewal, initial.rules.today);
  const fields = useRenewalFields(baseline);
  const epoch = useEditorLeave(runtime, fields, baseline);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  }, [props]);
  const allowed = () => canSave(latest.current.context, initial, runtime);
  const enabled = canSave(context, initial, runtime);
  const submit = () => {
    const parsed = parseRenewalDraft(fields.read());
    if (!parsed)
      return setError("Enter a title, valid renewal date and notice from 0 to 730 days.");
    if (!allowed()) return setError("Reload the current renewal before saving.");
    const members = latest.current.context.value?.members ?? [];
    if (parsed.responsibleId && !members.some((member) => member.actorId === parsed.responsibleId))
      return setError("Choose a current household member.");
    const capturedEpoch = epoch.current;
    const dialog = renewalConfirmation(
      { ...identity, expectedRevision: initial.renewal?.revision ?? null, fields: parsed },
      () => capturedEpoch === epoch.current && allowed(),
      runtime.save,
      reviewLabels(parsed, members, fields.linked, initial),
    );
    setError(null);
    Alert.alert("Save this renewal?", dialog.message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Save renewal",
        onPress: () => {
          void dialog.confirm();
        },
      },
    ]);
  };
  if (!runtime.getSnapshot().active) return <Note>Renewal details are hidden while inactive.</Note>;
  return (
    <>
      <RenewalFieldsView
        fields={fields}
        context={context.value ?? initial}
        disabled={!enabled}
        first={context.first}
        next={context.next}
      />
      {!enabled ? (
        <Note>
          Reload before saving. If the renewal changed, reopen it to review the latest version.
        </Note>
      ) : null}
      {error ? <Note>{error}</Note> : null}
      <NativeAction label="Review and save renewal" disabled={!enabled} onPress={submit} />
      <RemoveAction
        renewal={initial.renewal}
        enabled={enabled}
        runtime={runtime}
        current={allowed}
        epoch={epoch}
      />
    </>
  );
}

function canSave(
  context: Props["context"],
  initial: RenewalEditorContext,
  runtime: RenewalSaveRuntime,
) {
  const view = runtime.getSnapshot();
  if (!view.active || !view.online || !view.fresh || view.busy || view.attempt || view.result)
    return false;
  return matchingContext(context, initial);
}
function matchingContext(context: Props["context"], initial: RenewalEditorContext) {
  return (
    context.fresh &&
    context.value?.renewal?.revision === initial.renewal?.revision &&
    !initial.renewal?.removed
  );
}

function RemoveAction({
  renewal,
  enabled,
  runtime,
  current,
  epoch,
}: {
  renewal: RenewalEditorContext["renewal"];
  enabled: boolean;
  runtime: RenewalSaveRuntime;
  current: () => boolean;
  epoch: { current: number };
}) {
  if (!renewal) return null;
  return (
    <NativeAction
      label="Remove renewal"
      disabled={!enabled}
      onPress={() => {
        const capturedEpoch = epoch.current;
        confirmRenewalRemoval(renewal, () => capturedEpoch === epoch.current && current(), runtime);
      }}
    />
  );
}

function useEditorLeave(
  runtime: RenewalSaveRuntime,
  fields: ReturnType<typeof useRenewalFields>,
  baseline: ReturnType<typeof renewalDraft>,
) {
  const epoch = useRef(0);
  useLeaveRenewal(
    runtime,
    () => JSON.stringify(fields.read()) !== JSON.stringify(baseline),
    () => {
      epoch.current++;
    },
  );
  useLayoutEffect(
    () => () => {
      epoch.current++;
    },
    [],
  );
  return epoch;
}

function reviewLabels(
  parsed: NonNullable<ReturnType<typeof parseRenewalDraft>>,
  members: RenewalEditorContext["members"],
  selected: ReturnType<typeof useRenewalFields>["linked"],
  initial: RenewalEditorContext,
) {
  return {
    responsible:
      members.find((member) => member.actorId === parsed.responsibleId)?.displayName ??
      "Unassigned",
    linked: parsed.recurringRuleId
      ? (selected?.title ?? initial.linked?.rule.configuration.description ?? "Unavailable")
      : "None",
  };
}
