import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { CorrectionApprovalQuery } from "@nest/contracts/correction-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { correctionApprovalOwner } from "../money/correction-approval-owner";
import { correctionApprovalOperations } from "../money/correction-approval-operations";
import { useCorrectionApprovalActivity } from "../money/use-correction-approval-activity";
import type { CorrectionApprovalRuntime } from "../money/correction-approval-runtime";
import { CorrectionApprovalContent } from "../money/correction-approval-content";
export default function CorrectionApprovalScreen() {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(CorrectionApprovalQuery)({ approvalId }))
    return (
      <Page>
        <Note>This correction proposal link is invalid.</Note>
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
    correctionApprovalOwner(
      correctionApprovalOperations(props.account, props.client),
      props.approvalId,
    ),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveApproval {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening private correction proposal…</Note>
    </Page>
  );
}
function ActiveApproval({
  runtime,
  account,
  verify,
}: MoneyScreenAccount & { runtime: CorrectionApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useCorrectionApprovalActivity(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return <CorrectionApprovalContent runtime={runtime} view={view} actor={account.session.actor} />;
}
