import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { RecurringDetailQuery } from "@nest/contracts/recurring-read";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { recurringReadOwner } from "../money/recurring-read-owner";
import { recurringReadOperations } from "../money/recurring-read-operations";
import type { RecurringReadRuntime, RecurringReadView } from "../money/recurring-read-runtime";
import { recurringStateSaveOwner } from "../money/recurring-state-save-owner";
import { recurringStateSaveOperations } from "../money/recurring-state-save-operations";
import type {
  RecurringStateSaveRuntime,
  RecurringStateSaveView,
} from "../money/recurring-state-save-runtime";
import { RecurringStateControls, RecurringStateRecovery } from "../money/recurring-state-content";
import { useSaveActivity } from "../money/use-save-activity";
export default function RecurringStateScreen() {
  const { ruleId } = useLocalSearchParams();
  if (!Schema.is(RecurringDetailQuery)({ ruleId }))
    return (
      <Page>
        <Note>Invalid recurring rule link.</Note>
      </Page>
    );
  const target = String(ruleId).toLowerCase();
  return (
    <MoneyScreenGate>
      {(props) => (
        <OwnedState {...props} ruleId={target} key={`${props.account.session.lease}:${target}`} />
      )}
    </MoneyScreenGate>
  );
}
function OwnedState(props: MoneyScreenAccount & { ruleId: string }) {
  const [readOwner] = useState(() =>
    recurringReadOwner(recurringReadOperations(props.account, props.client), {
      kind: "detail",
      ruleId: props.ruleId,
    }),
  );
  const [saveOwner] = useState(() =>
    recurringStateSaveOwner(recurringStateSaveOperations(props.account, props.client)),
  );
  const read = useSyncExternalStore(readOwner.subscribe, readOwner.getSnapshot);
  const save = useSyncExternalStore(saveOwner.subscribe, saveOwner.getSnapshot);
  return read && save ? (
    <ActiveState {...props} read={read} save={save} />
  ) : (
    <Page>
      <Note>Opening recurring controls…</Note>
    </Page>
  );
}
function ActiveState({
  read,
  save,
  verify,
}: MoneyScreenAccount & { read: RecurringReadRuntime; save: RecurringStateSaveRuntime }) {
  const current = useSyncExternalStore(read.subscribe, read.getSnapshot);
  const view = useSyncExternalStore(save.subscribe, save.getSnapshot);
  useSaveActivity(read);
  useSaveActivity(save);
  if (current.verify || view.verify) return <VerifyMoney verify={verify} />;
  if (!view.active)
    return (
      <Page>
        <Note>Recurring controls are hidden while inactive.</Note>
      </Page>
    );
  const recovery = view.attempt !== null || view.result !== null;
  return (
    <Page>
      <StateNotices current={current} view={view} />
      {recovery ? (
        <RecurringStateRecovery
          runtime={save}
          view={view}
          next={() => {
            save.acknowledge();
            void read.refresh();
          }}
        />
      ) : (
        <RecurringStateControls read={read} save={save} />
      )}
      <NativeAction
        label="Check current rule and request status"
        disabled={!view.online || view.busy || current.busy}
        onPress={() => {
          void read.refresh();
          void save.refresh();
        }}
      />
    </Page>
  );
}

function StateNotices({
  current,
  view,
}: {
  current: RecurringReadView;
  view: RecurringStateSaveView;
}) {
  return (
    <>
      {!view.online ? (
        <Note>Connect to check or change this rule. Financial writes are not queued offline.</Note>
      ) : null}
      {view.busy || current.busy ? <Note>Checking recurring state…</Note> : null}
      {current.notice ? <Note>{current.notice}</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
    </>
  );
}
