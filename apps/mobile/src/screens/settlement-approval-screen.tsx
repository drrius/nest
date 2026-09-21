import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { SettlementApprovalQuery } from "@nest/contracts/settlement-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { settlementApprovalOwner } from "../money/settlement-approval-owner";
import { settlementApprovalOperations } from "../money/settlement-approval-operations";
import { useSettlementApprovalActivity } from "../money/use-settlement-approval-activity";
import type { SettlementApprovalRuntime } from "../money/settlement-approval-runtime";
import { SettlementApprovalContent } from "../money/settlement-approval-content";
export default function SettlementApprovalScreen() {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(SettlementApprovalQuery)({ approvalId }))
    return (
      <Page>
        <Note>This settlement proposal link is invalid.</Note>
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
    settlementApprovalOwner(
      settlementApprovalOperations(props.account, props.client),
      props.approvalId,
    ),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveApproval {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening private settlement proposal…</Note>
    </Page>
  );
}
function ActiveApproval({
  runtime,
  account,
  verify,
}: MoneyScreenAccount & { runtime: SettlementApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSettlementApprovalActivity(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return <SettlementApprovalContent runtime={runtime} view={view} actor={account.session.actor} />;
}
