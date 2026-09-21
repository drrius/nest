import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { MoneyDetailQuery } from "@nest/contracts/money-detail";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { recurringReadOwner } from "../money/recurring-read-owner";
import { recurringReadOperations } from "../money/recurring-read-operations";
import { moneyReadOwner } from "../money/read-owner";
import { moneyReadOperations } from "../money/read-operations";
import { manualCycleSaveOwner } from "../money/recurring-manual-save-owner";
import { manualCycleSaveOperations } from "../money/recurring-manual-save-operations";
import { ManualSaveRecovery } from "../money/recurring-manual-recovery";
import { ManualRulePicker } from "../money/recurring-manual-picker";
import {
  ManualReview,
  useLeaveManual,
  type ManualRuntimes,
} from "../money/recurring-manual-actions";
import { useSaveActivity } from "../money/use-save-activity";
import { useMoneyActivity } from "../money/use-activity";
import type { MoneyReadRuntime } from "../money/read-runtime";
export default function RecurringManualScreen() {
  const { eventId } = useLocalSearchParams();
  if (typeof eventId !== "string" || !Schema.is(MoneyDetailQuery)({ eventId }))
    return (
      <Page>
        <Note>Invalid financial entry link.</Note>
      </Page>
    );
  return (
    <MoneyScreenGate>
      {(props) => (
        <Owned
          {...props}
          eventId={eventId.toLowerCase()}
          key={`${props.account.session.lease}:${eventId}`}
        />
      )}
    </MoneyScreenGate>
  );
}
function Owned(props: MoneyScreenAccount & { eventId: string }) {
  const [ruleOwner] = useState(() =>
    recurringReadOwner(recurringReadOperations(props.account, props.client), {
      kind: "list",
      after: null,
    }),
  );
  const [sourceOwner] = useState(() =>
    moneyReadOwner(moneyReadOperations(props.account, props.client), [
      { kind: "detail", eventId: props.eventId },
    ]),
  );
  const [saveOwner] = useState(() =>
    manualCycleSaveOwner(manualCycleSaveOperations(props.account, props.client)),
  );
  const rule = useSyncExternalStore(ruleOwner.subscribe, ruleOwner.getSnapshot);
  const sources = useSyncExternalStore(sourceOwner.subscribe, sourceOwner.getSnapshot);
  const save = useSyncExternalStore(saveOwner.subscribe, saveOwner.getSnapshot);
  return rule && sources && save ? (
    <Active {...props} rule={rule} sources={sources} source={sources[0]!} save={save} />
  ) : (
    <Page>
      <Note>Opening expense linkage…</Note>
    </Page>
  );
}
function Active(
  props: MoneyScreenAccount & ManualRuntimes & { sources: readonly MoneyReadRuntime[] },
) {
  const { rule, source, save, sources } = props;
  const current = useSyncExternalStore(rule.subscribe, rule.getSnapshot);
  const expense = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const view = useSyncExternalStore(save.subscribe, save.getSnapshot);
  useMoneyActivity(sources);
  useSaveActivity(rule);
  useSaveActivity(save);
  useLeaveManual(save);
  if (current.verify || view.verify || expense.access === "verify")
    return <VerifyMoney verify={props.verify} />;
  if (!view.active)
    return (
      <Page>
        <Note>Financial details are hidden while inactive.</Note>
      </Page>
    );
  return <Content props={props} current={current} expense={expense} view={view} />;
}
function Content({
  props,
  current,
  expense,
  view,
}: {
  props: MoneyScreenAccount & ManualRuntimes;
  current: ReturnType<ManualRuntimes["rule"]["getSnapshot"]>;
  expense: ReturnType<ManualRuntimes["source"]["getSnapshot"]>;
  view: ReturnType<ManualRuntimes["save"]["getSnapshot"]>;
}) {
  const { rule, source, save } = props;
  const working = view.busy || current.busy || expense.busy;
  const refresh = () => {
    void rule.refresh();
    void source.refresh();
    void save.refresh();
  };
  return (
    <Page>
      {!view.online ? (
        <Note>Connect to review or link an existing expense. Requests are not queued offline.</Note>
      ) : null}
      {working ? <Note>Checking expense and recurring state…</Note> : null}
      {[view.notice, current.notice, expense.notice].filter(Boolean).map((notice, i) => (
        <Note key={i}>{notice}</Note>
      ))}
      {view.attempt || view.result ? (
        <ManualSaveRecovery
          runtime={save}
          view={view}
          next={() => {
            save.acknowledge();
            refresh();
          }}
        />
      ) : (
        <>
          <ManualRulePicker runtime={rule} view={current} />
          {current.entry?.kind === "detail" ? (
            <ManualReview runtimes={props} actor={props.account.session.actor} />
          ) : null}
        </>
      )}
      <NativeAction
        label="Reload expense, rules and request status"
        disabled={!view.online || working}
        onPress={refresh}
      />
    </Page>
  );
}
