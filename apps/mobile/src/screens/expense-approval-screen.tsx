import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { ExpenseApprovalQuery } from "@nest/contracts/expense-approval";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { expenseApprovalOwner } from "../money/approval-owner";
import { expenseApprovalOperations } from "../money/approval-operations";
import { useApprovalActivity } from "../money/use-approval-activity";
import type { ExpenseApprovalRuntime } from "../money/approval-runtime";
import { ExpenseApprovalContent } from "../money/approval-content";
export default function ExpenseApprovalScreen() {
  const { approvalId } = useLocalSearchParams();
  if (typeof approvalId !== "string" || !Schema.is(ExpenseApprovalQuery)({ approvalId }))
    return (
      <Page>
        <Note>This expense proposal link is invalid.</Note>
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
    expenseApprovalOwner(expenseApprovalOperations(props.account, props.client), props.approvalId),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveApproval {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening private expense proposal…</Note>
    </Page>
  );
}
function ActiveApproval({
  runtime,
  account,
  verify,
}: MoneyScreenAccount & { runtime: ExpenseApprovalRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useApprovalActivity(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return <ExpenseApprovalContent runtime={runtime} view={view} actor={account.session.actor} />;
}
