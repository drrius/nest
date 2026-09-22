import { useLeavePendingApproval } from "../money/use-leave-pending-approval";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { LegacyAdoptionApprovalQuery } from "@nest/contracts/legacy-adoption-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { legacyAdoptionApprovalOwner } from "../money/legacy-adoption-approval-owner";
import { legacyAdoptionApprovalOperations } from "../money/legacy-adoption-approval-operations";
import { useSaveActivity } from "../money/use-save-activity";
import type { LegacyAdoptionApprovalRuntime } from "../money/legacy-adoption-approval-runtime";
import { LegacyAdoptionApprovalContent } from "../money/legacy-adoption-approval-content";
export default function LegacyAdoptionApprovalScreen() {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(LegacyAdoptionApprovalQuery)({ approvalId }))
    return (
      <Page>
        <Note>This recurring adoption proposal link is invalid.</Note>
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
    legacyAdoptionApprovalOwner(
      legacyAdoptionApprovalOperations(props.account, props.client),
      props.approvalId,
    ),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveApproval {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening private recurring adoption proposal…</Note>
    </Page>
  );
}
function ActiveApproval({
  runtime,
  verify,
  account,
}: MoneyScreenAccount & { runtime: LegacyAdoptionApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  useLeavePendingApproval(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return (
    <LegacyAdoptionApprovalContent runtime={runtime} view={view} actor={account.session.actor} />
  );
}
