import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { RefundApprovalQuery } from "@nest/contracts/refund-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { refundApprovalOwner } from "../money/refund-approval-owner";
import { refundApprovalOperations } from "../money/refund-approval-operations";
import { useRefundApprovalActivity } from "../money/use-refund-approval-activity";
import type { RefundApprovalRuntime } from "../money/refund-approval-runtime";
import { RefundApprovalContent } from "../money/refund-approval-content";
export default function RefundApprovalScreen() {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(RefundApprovalQuery)({ approvalId }))
    return (
      <Page>
        <Note>This refund proposal link is invalid.</Note>
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
    refundApprovalOwner(refundApprovalOperations(props.account, props.client), props.approvalId),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveApproval {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening private refund proposal…</Note>
    </Page>
  );
}
function ActiveApproval({
  runtime,
  account,
  verify,
}: MoneyScreenAccount & { runtime: RefundApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useRefundApprovalActivity(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return <RefundApprovalContent runtime={runtime} view={view} actor={account.session.actor} />;
}
