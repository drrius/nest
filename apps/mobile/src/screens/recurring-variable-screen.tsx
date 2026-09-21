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
import { variableCycleSaveOwner } from "../money/recurring-variable-save-owner";
import { variableCycleSaveOperations } from "../money/recurring-variable-save-operations";
import type {
  VariableCycleSaveRuntime,
  VariableCycleSaveView,
} from "../money/recurring-variable-save-runtime";
import { VariableSaveRecovery } from "../money/recurring-variable-recovery";
import { VariableAmountFields } from "../money/recurring-variable-fields";
import { useVariableAmount } from "../money/use-variable-amount";
import { currentVariableDetail } from "../money/recurring-variable-confirmation";
import { useEntryOptions } from "../money/use-entry-options";
import { useSaveActivity } from "../money/use-save-activity";
export default function RecurringVariableScreen() {
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
    variableCycleSaveOwner(variableCycleSaveOperations(props.account, props.client)),
  );
  const read = useSyncExternalStore(readOwner.subscribe, readOwner.getSnapshot);
  const save = useSyncExternalStore(saveOwner.subscribe, saveOwner.getSnapshot);
  return read && save ? (
    <ActiveState {...props} read={read} save={save} />
  ) : (
    <Page>
      <Note>Opening variable bill…</Note>
    </Page>
  );
}
function ActiveState({
  read,
  save,
  verify,
  account,
  client,
}: MoneyScreenAccount & { read: RecurringReadRuntime; save: VariableCycleSaveRuntime }) {
  const current = useSyncExternalStore(read.subscribe, read.getSnapshot);
  const view = useSyncExternalStore(save.subscribe, save.getSnapshot);
  useSaveActivity(read);
  useSaveActivity(save);
  const options = useEntryOptions(
    { account, client, verify },
    view.active && !view.verify,
    view.online,
  );
  const draft = useVariableAmount(read, save, options.fresh ? options.value : null);
  const detail = currentVariableDetail(current, view);
  if (current.verify || view.verify || options.verify) return <VerifyMoney verify={verify} />;
  if (!view.active)
    return (
      <Page>
        <Note>Variable bill details are hidden while inactive.</Note>
      </Page>
    );
  return (
    <Page>
      <StateNotices current={current} view={view} />
      <VariableBody
        save={save}
        read={read}
        view={view}
        options={options}
        draft={draft}
        detail={detail}
        actor={account.session.actor}
      />
      <NativeAction
        label="Check current bill and request status"
        disabled={!view.online || view.busy || current.busy}
        onPress={() => {
          void read.refresh();
          void save.refresh();
          options.reload();
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
  view: VariableCycleSaveView;
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

function VariableBody({
  save,
  read,
  view,
  options,
  draft,
  detail,
  actor,
}: {
  save: VariableCycleSaveRuntime;
  read: RecurringReadRuntime;
  view: VariableCycleSaveView;
  options: ReturnType<typeof useEntryOptions>;
  draft: ReturnType<typeof useVariableAmount>;
  detail: ReturnType<typeof currentVariableDetail>;
  actor: string;
}) {
  if (view.attempt !== null || view.result !== null)
    return (
      <VariableSaveRecovery
        runtime={save}
        view={view}
        next={() => {
          save.acknowledge();
          void read.refresh();
        }}
      />
    );
  if (detail && options.fresh && options.value)
    return (
      <VariableAmountFields
        draft={draft}
        options={options.value}
        rule={detail.rule}
        actor={actor}
      />
    );
  return (
    <Note>
      {options.failed
        ? "Could not load members and categories. Check again online."
        : "Load a current active variable rule with a due cycle online to enter its amount."}
    </Note>
  );
}
