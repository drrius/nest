import type { RecurringApprovalKind } from "../money/recurring-lifecycle-approval";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { RecurringStateApprovalQuery } from "@nest/contracts/recurring-state-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { recurringStateApprovalOwner } from "../money/recurring-state-approval-owner";
import { recurringStateApprovalOperations } from "../money/recurring-state-approval-operations";
import { useSaveActivity } from "../money/use-save-activity";
import type { RecurringStateApprovalRuntime } from "../money/recurring-state-approval-runtime";
import { RecurringStateApprovalContent } from "../money/recurring-state-approval-content";
export default function RecurringStateApprovalScreen({
  kind = "state",
}: {
  kind?: RecurringApprovalKind;
}) {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(RecurringStateApprovalQuery)({ approvalId }))
    return (
      <Page>
        <Note>This recurring proposal link is invalid.</Note>
      </Page>
    );
  const target = approvalId.toLowerCase();
  return (
    <MoneyScreenGate>
      {(props) => (
        <Approval
          key={`${props.account.session.lease}:${kind}:${target}`}
          {...props}
          approvalId={target}
          kind={kind}
        />
      )}
    </MoneyScreenGate>
  );
}
function Approval(props: MoneyScreenAccount & { approvalId: string; kind: RecurringApprovalKind }) {
  const [owner] = useState(() =>
    recurringStateApprovalOwner(
      recurringStateApprovalOperations(props.account, props.client, props.kind),
      props.approvalId,
    ),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveApproval {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening private recurring proposal…</Note>
    </Page>
  );
}
function ActiveApproval({
  runtime,
  verify,
  account,
}: MoneyScreenAccount & { runtime: RecurringStateApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return (
    <RecurringStateApprovalContent runtime={runtime} view={view} actor={account.session.actor} />
  );
}
