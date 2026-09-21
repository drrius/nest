import { useState, useSyncExternalStore } from "react";
import { Page, Note } from "../components/page";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { receiptRecoveryOwner } from "../money/receipt-recovery-owner";
import { receiptRecoveryOperations } from "../money/receipt-recovery-operations";
import type { ReceiptRecoveryRuntime } from "../money/receipt-recovery-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { ReceiptRecoveryContent } from "../money/receipt-recovery-content";
export default function ReceiptRecoveryScreen() {
  return (
    <MoneyScreenGate>
      {(props) => <Recovery key={props.account.session.lease} {...props} />}
    </MoneyScreenGate>
  );
}
function Recovery(props: MoneyScreenAccount) {
  const [owner] = useState(() =>
    receiptRecoveryOwner(receiptRecoveryOperations(props.account, props.client)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveRecovery {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening receipt uploads…</Note>
    </Page>
  );
}
function ActiveRecovery({
  runtime,
  verify,
}: MoneyScreenAccount & { runtime: ReceiptRecoveryRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return <ReceiptRecoveryContent runtime={runtime} view={view} />;
}
