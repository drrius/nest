import { useLeavePendingApproval } from "../money/use-leave-pending-approval";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { LegacyConfirmationApprovalQuery } from "@nest/contracts/legacy-confirmation-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { legacyConfirmationApprovalOwner } from "../money/legacy-confirmation-approval-owner";
import { legacyConfirmationApprovalOperations } from "../money/legacy-confirmation-approval-operations";
import { useSaveActivity } from "../money/use-save-activity";
import type { LegacyConfirmationApprovalRuntime } from "../money/legacy-confirmation-approval-runtime";
import { LegacyConfirmationApprovalContent } from "../money/legacy-confirmation-approval-content";
export default function LegacyConfirmationApprovalScreen() {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(LegacyConfirmationApprovalQuery)({ approvalId }))
    return (
      <Page>
        <Note>This expense confirmation proposal link is invalid.</Note>
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
    legacyConfirmationApprovalOwner(
      legacyConfirmationApprovalOperations(props.account, props.client),
      props.approvalId,
    ),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveApproval {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening private expense confirmation proposal…</Note>
    </Page>
  );
}
function ActiveApproval({
  runtime,
  verify,
  account,
}: MoneyScreenAccount & { runtime: LegacyConfirmationApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  useLeavePendingApproval(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return (
    <LegacyConfirmationApprovalContent
      runtime={runtime}
      view={view}
      actor={account.session.actor}
    />
  );
}
