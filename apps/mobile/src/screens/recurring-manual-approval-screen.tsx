import { useLeavePendingApproval } from "../money/use-leave-pending-approval";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { ManualCycleApprovalQuery } from "@nest/contracts/recurring-manual-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { manualCycleApprovalOwner } from "../money/recurring-manual-approval-owner";
import { manualCycleApprovalOperations } from "../money/recurring-manual-approval-operations";
import { useSaveActivity } from "../money/use-save-activity";
import type { ManualCycleApprovalRuntime } from "../money/recurring-manual-approval-runtime";
import { ManualCycleApprovalContent } from "../money/recurring-manual-approval-content";
export default function ManualCycleApprovalScreen() {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(ManualCycleApprovalQuery)({ approvalId }))
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
    manualCycleApprovalOwner(
      manualCycleApprovalOperations(props.account, props.client),
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
}: MoneyScreenAccount & { runtime: ManualCycleApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  useLeavePendingApproval(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return <ManualCycleApprovalContent runtime={runtime} view={view} actor={account.session.actor} />;
}
