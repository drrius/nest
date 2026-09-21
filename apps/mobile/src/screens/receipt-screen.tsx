import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import * as Browser from "expo-web-browser";
import { ReceiptTarget, canonicalReceiptTarget } from "@nest/contracts/receipt";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { Page, Note } from "../components/page";
import { receiptViewOwner } from "../money/receipt-view-owner";
import { receiptViewOperations } from "../money/receipt-view-operations";
import { useReceiptViewActivity } from "../money/use-receipt-view-activity";
import type { ReceiptViewRuntime } from "../money/receipt-view-runtime";
import { ReceiptViewContent } from "../money/receipt-view-content";
const browser = {
  open: (url: string) => Browser.openBrowserAsync(url, { dismissButtonStyle: "close" }),
  close: () => Browser.dismissBrowser(),
};
export default function ReceiptScreen() {
  const params = useLocalSearchParams();
  const result = Schema.decodeUnknownExit(ReceiptTarget)(params, { onExcessProperty: "error" });
  if (result._tag === "Failure")
    return (
      <Page>
        <Note>This receipt link is invalid.</Note>
      </Page>
    );
  const target = canonicalReceiptTarget(result.value),
    key = JSON.stringify(target);
  return (
    <MoneyScreenGate>
      {(props) => (
        <Receipt key={`${props.account.session.lease}:${key}`} {...props} target={target} />
      )}
    </MoneyScreenGate>
  );
}
function Receipt(props: MoneyScreenAccount & { target: ReceiptTarget }) {
  const [owner] = useState(() =>
    receiptViewOwner(receiptViewOperations(props.account, props.client, browser), props.target),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveReceipt {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening receipt…</Note>
    </Page>
  );
}
function ActiveReceipt({ runtime, verify }: MoneyScreenAccount & { runtime: ReceiptViewRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useReceiptViewActivity(runtime);
  if (view.verify) return <VerifyMoney verify={verify} />;
  return <ReceiptViewContent runtime={runtime} view={view} />;
}
