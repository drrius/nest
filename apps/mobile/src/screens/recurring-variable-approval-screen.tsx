import { useLeavePendingApproval } from "../money/use-leave-pending-approval";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { VariableCycleApprovalQuery } from "@nest/contracts/recurring-variable-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { variableCycleApprovalOwner } from "../money/recurring-variable-approval-owner";
import { variableCycleApprovalOperations } from "../money/recurring-variable-approval-operations";
import { useSaveActivity } from "../money/use-save-activity";
import type { VariableCycleApprovalRuntime } from "../money/recurring-variable-approval-runtime";
import { VariableCycleApprovalContent } from "../money/recurring-variable-approval-content";
export default function VariableCycleApprovalScreen() {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(VariableCycleApprovalQuery)({ approvalId }))
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
    variableCycleApprovalOwner(
      variableCycleApprovalOperations(props.account, props.client),
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
}: MoneyScreenAccount & { runtime: VariableCycleApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  useLeavePendingApproval(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return (
    <VariableCycleApprovalContent runtime={runtime} view={view} actor={account.session.actor} />
  );
}
