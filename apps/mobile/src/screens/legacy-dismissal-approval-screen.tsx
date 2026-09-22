import { useLeavePendingApproval } from "../money/use-leave-pending-approval";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { LegacyDismissalApprovalQuery } from "@nest/contracts/legacy-dismissal-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { legacyDismissalApprovalOwner } from "../money/legacy-dismissal-approval-owner";
import { legacyDismissalApprovalOperations } from "../money/legacy-dismissal-approval-operations";
import { useSaveActivity } from "../money/use-save-activity";
import type { LegacyDismissalApprovalRuntime } from "../money/legacy-dismissal-approval-runtime";
import { LegacyDismissalApprovalContent } from "../money/legacy-dismissal-approval-content";
export default function LegacyDismissalApprovalScreen() {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(LegacyDismissalApprovalQuery)({ approvalId }))
    return (
      <Page>
        <Note>This draft dismissal proposal link is invalid.</Note>
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
    legacyDismissalApprovalOwner(
      legacyDismissalApprovalOperations(props.account, props.client),
      props.approvalId,
    ),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveApproval {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening private draft dismissal proposal…</Note>
    </Page>
  );
}
function ActiveApproval({
  runtime,
  verify,
  account,
}: MoneyScreenAccount & { runtime: LegacyDismissalApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  useLeavePendingApproval(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return (
    <LegacyDismissalApprovalContent runtime={runtime} view={view} actor={account.session.actor} />
  );
}
