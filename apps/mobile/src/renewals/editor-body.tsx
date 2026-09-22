import { useMemo, useSyncExternalStore } from "react";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { VerifyRenewal } from "./screen-gate";
import type { RenewalEditorAccount } from "./editor-gate";
import type { RenewalSaveRuntime } from "./save-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { useRenewalEditorContext } from "./use-editor-context";
import { RenewalRecovery } from "./recovery";
import { RenewalEditorForm } from "./editor-form";
export function RenewalEditorBody(
  props: RenewalEditorAccount & { renewalId: string | null; runtime: RenewalSaveRuntime },
) {
  const { runtime } = props;
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  const clients = useMemo(
    () => ({ renewals: props.client, routines: props.routines, money: props.money }),
    [props.client, props.routines, props.money],
  );
  const context = useRenewalEditorContext(props.account, clients, props.renewalId, view);
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
        <RenewalRecovery
          runtime={runtime}
          next={() => {
            runtime.acknowledge();
            refresh();
          }}
        />
      ) : (
        <RenewalEditorForm runtime={runtime} context={context} renewalId={props.renewalId} />
      )}
      <NativeAction
        label="Reload renewal and request status"
        disabled={!view.active || !view.online || view.busy}
        onPress={refresh}
      />
    </Page>
  );
}
