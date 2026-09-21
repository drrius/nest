import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { RecurringApprovalQuery } from "@nest/contracts/recurring-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { recurringApprovalOwner } from "../money/recurring-approval-owner";
import { recurringApprovalOperations } from "../money/recurring-approval-operations";
import { useSaveActivity } from "../money/use-save-activity";
import type { RecurringApprovalRuntime } from "../money/recurring-approval-runtime";
import { RecurringApprovalContent } from "../money/recurring-approval-content";
export default function RecurringApprovalScreen() {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(RecurringApprovalQuery)({ approvalId }))
    return (
      <Page>
        <Note>This recurring proposal link is invalid.</Note>
      </Page>
    );
  const target = approvalId.toLowerCase();
  return (
    <MoneyScreenGate>
      {(props) => (
        <Approval key={`${props.account.session.lease}:${target}`} {...props} approvalId={target} />
      )}
    </MoneyScreenGate>
  );
}
function Approval(props: MoneyScreenAccount & { approvalId: string }) {
  const [owner] = useState(() =>
    recurringApprovalOwner(
      recurringApprovalOperations(props.account, props.client),
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
  account,
  verify,
}: MoneyScreenAccount & { runtime: RecurringApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return <RecurringApprovalContent runtime={runtime} view={view} actor={account.session.actor} />;
}
