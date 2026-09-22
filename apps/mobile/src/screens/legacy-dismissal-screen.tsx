import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { LegacyDraftContextQuery } from "@nest/contracts/legacy-draft-dismissal";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { recurringReadOwner } from "../money/recurring-read-owner";
import { recurringReadOperations } from "../money/recurring-read-operations";
import { legacyDismissalSaveOwner } from "../money/legacy-dismissal-save-owner";
import { legacyDismissalSaveOperations } from "../money/legacy-dismissal-save-operations";
import { DismissalRecovery } from "../money/legacy-dismissal-recovery";
import {
  DismissalReview,
  useLeaveDismissal,
  type DismissalRuntimes,
} from "../money/legacy-dismissal-actions";
import { useSaveActivity } from "../money/use-save-activity";
export default function LegacyDismissalScreen() {
  const { draftId } = useLocalSearchParams();
  if (typeof draftId !== "string" || !Schema.is(LegacyDraftContextQuery)({ draftId }))
    return (
      <Page>
        <Note>Invalid legacy draft link.</Note>
      </Page>
    );
  return (
    <MoneyScreenGate>
      {(props) => (
        <Owned
          {...props}
          draftId={draftId.toLowerCase()}
          key={`${props.account.session.lease}:${draftId}`}
        />
      )}
    </MoneyScreenGate>
  );
}
function Owned(props: MoneyScreenAccount & { draftId: string }) {
  const [readOwner] = useState(() =>
    recurringReadOwner(recurringReadOperations(props.account, props.client), {
      kind: "legacy-review",
      draftId: props.draftId,
    }),
  );
  const [saveOwner] = useState(() =>
    legacyDismissalSaveOwner(legacyDismissalSaveOperations(props.account, props.client)),
  );
  const read = useSyncExternalStore(readOwner.subscribe, readOwner.getSnapshot);
  const save = useSyncExternalStore(saveOwner.subscribe, saveOwner.getSnapshot);
  return read && save ? (
    <Active {...props} read={read} save={save} />
  ) : (
    <Page>
      <Note>Opening draft review…</Note>
    </Page>
  );
}
function Active(props: MoneyScreenAccount & DismissalRuntimes) {
  const { read, save } = props;
  const current = useSyncExternalStore(read.subscribe, read.getSnapshot);
  const view = useSyncExternalStore(save.subscribe, save.getSnapshot);
  useSaveActivity(read);
  useSaveActivity(save);
  useLeaveDismissal(save);
  if (current.verify || view.verify) return <VerifyMoney verify={props.verify} />;
  if (!view.active)
    return (
      <Page>
        <Note>Draft details are hidden while inactive.</Note>
      </Page>
    );
  const working = view.busy || current.busy;
  const refresh = () => {
    void read.refresh();
    void save.refresh();
  };
  return (
    <Page>
      {!view.online ? (
        <Note>Connect to review or dismiss this draft. Dismissals are not queued offline.</Note>
      ) : null}
      {working ? <Note>Checking draft and saved request…</Note> : null}
      {[view.notice, current.notice].filter(Boolean).map((notice, i) => (
        <Note key={i}>{notice}</Note>
      ))}
      {view.attempt || view.result ? (
        <DismissalRecovery
          runtime={save}
          view={view}
          next={() => {
            save.acknowledge();
            refresh();
          }}
        />
      ) : (
        <DismissalReview read={read} save={save} actor={props.account.session.actor} />
      )}
      <NativeAction
        label="Reload draft and request status"
        disabled={!view.online || working}
        onPress={refresh}
      />
    </Page>
  );
}
