import { reminderNeedsVerification } from "./editor-access";
import { useMemo, useSyncExternalStore } from "react";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";

import type { ReminderEditorAccount } from "./editor-gate";
import type { ChoreReminderSaveRuntime } from "./save-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { useReminderEditorContext } from "./use-editor-context";
import { ReminderRecovery } from "./recovery";
import { ReminderEditorForm } from "./editor-form";
export function ReminderEditorBody(
  props: ReminderEditorAccount & { occurrenceId: string; runtime: ChoreReminderSaveRuntime },
) {
  const { runtime } = props;
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  const clients = useMemo(
    () => ({ routines: props.routines, reminders: props.reminders }),
    [props.routines, props.reminders],
  );
  const context = useReminderEditorContext(props.account, clients, props.occurrenceId, view);
  if (reminderNeedsVerification(view, context))
    return (
      <Page>
        <Note>Verify your account before managing reminders.</Note>
        <NativeAction
          label="Verify account and reload"
          onPress={() => {
            props.verify();
            context.reload();
            void runtime.refresh();
          }}
        />
      </Page>
    );
  const refresh = () => {
    context.reload();
    void runtime.refresh();
  };
  return (
    <Page>
      {!view.online ? <Note>Connect to manage chores. Changes are not queued offline.</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {context.failed ? <Note>Could not load chore choices. Reload to retry.</Note> : null}
      {view.attempt || view.result ? (
        <ReminderRecovery
          context={context.value}
          occurrenceId={props.occurrenceId}
          runtime={runtime}
          next={() => {
            runtime.acknowledge();
            refresh();
          }}
        />
      ) : (
        <ReminderEditorForm runtime={runtime} context={context} occurrenceId={props.occurrenceId} />
      )}
      <NativeAction
        label="Reload chore and request status"
        disabled={!view.active || !view.online || view.busy}
        onPress={refresh}
      />
    </Page>
  );
}
