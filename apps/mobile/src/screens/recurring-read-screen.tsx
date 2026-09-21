import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { RecurringDetailQuery } from "@nest/contracts/recurring-read";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { recurringReadOwner } from "../money/recurring-read-owner";
import {
  recurringReadOperations,
  type RecurringReadTarget,
} from "../money/recurring-read-operations";
import type { RecurringReadRuntime } from "../money/recurring-read-runtime";
import { RecurringReadContent } from "../money/recurring-read-content";
import { useSaveActivity } from "../money/use-save-activity";
export function RecurringListScreen() {
  return <ReadScreen target={{ kind: "list", after: null }} />;
}
export function RecurringDetailScreen() {
  const { ruleId } = useLocalSearchParams();
  if (!Schema.is(RecurringDetailQuery)({ ruleId }))
    return (
      <Page>
        <Note>Invalid recurring expense link.</Note>
      </Page>
    );
  return <ReadScreen target={{ kind: "detail", ruleId: String(ruleId).toLowerCase() }} />;
}
function ReadScreen({ target }: { target: RecurringReadTarget }) {
  return (
    <MoneyScreenGate>
      {(props) => (
        <OwnedRead
          {...props}
          target={target}
          key={`${props.account.session.lease}:${target.kind === "detail" ? target.ruleId : "list"}`}
        />
      )}
    </MoneyScreenGate>
  );
}
function OwnedRead(props: MoneyScreenAccount & { target: RecurringReadTarget }) {
  const [owner] = useState(() =>
    recurringReadOwner(recurringReadOperations(props.account, props.client), props.target),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveRead {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening recurring expenses…</Note>
    </Page>
  );
}
function ActiveRead({
  runtime,
  account,
  verify,
}: MoneyScreenAccount & { runtime: RecurringReadRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return <RecurringReadContent runtime={runtime} view={view} actor={account.session.actor} />;
}
