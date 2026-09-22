import { useMemo, useSyncExternalStore } from "react";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { VerifyRenewal } from "../renewals/screen-gate";
import type { ReminderEditorAccount } from "./editor-gate";
import type { RenewalReminderSaveRuntime } from "./save-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { useReminderEditorContext } from "./use-editor-context";
import { ReminderRecovery } from "./recovery";
import { ReminderEditorForm } from "./editor-form";
export function ReminderEditorBody(
  props: ReminderEditorAccount & { renewalId: string; runtime: RenewalReminderSaveRuntime },
) {
  const { runtime } = props;
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  const clients = useMemo(
    () => ({ renewals: props.client, routines: props.routines, reminders: props.reminders }),
    [props.client, props.routines, props.reminders],
  );
  const context = useReminderEditorContext(props.account, clients, props.renewalId, view);
  if (view.verify || context.verify) return <VerifyRenewal verify={props.verify} />;
  const refresh = () => {
    context.reload();
    void runtime.refresh();
  };
  return (
    <Page>
      {!view.online ? (
        <Note>Connect to manage renewals. Changes are not queued offline.</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {context.failed ? <Note>Could not load renewal choices. Reload to retry.</Note> : null}
      {view.attempt || view.result ? (
        <ReminderRecovery
          runtime={runtime}
          next={() => {
            runtime.acknowledge();
            refresh();
          }}
        />
      ) : (
        <ReminderEditorForm runtime={runtime} context={context} renewalId={props.renewalId} />
      )}
      <NativeAction
        label="Reload renewal and request status"
        disabled={!view.active || !view.online || view.busy}
        onPress={refresh}
      />
    </Page>
  );
}
