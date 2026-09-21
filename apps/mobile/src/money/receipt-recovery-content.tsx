import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { Page, Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { ReceiptRecoveryRuntime, ReceiptRecoveryView } from "./receipt-recovery-runtime";
import type { RecoveryRow } from "./receipt-recovery-operations";
export function ReceiptRecoveryContent({
  runtime,
  view,
}: {
  runtime: ReceiptRecoveryRuntime;
  view: ReceiptRecoveryView;
}) {
  if (!view.active)
    return (
      <Page>
        <Note>Receipt uploads are paused.</Note>
      </Page>
    );
  const disabled = recoveryDisabled(view);
  return (
    <Page>
      <Note>
        Your unclaimed receipt uploads. Recorded financial receipts are retained in their expense
        history.
      </Note>
      {!view.online ? <Note>Go online to check or remove uploads.</Note> : null}
      {view.busy ? <Note>Checking receipt uploads…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <NativeAction
        label="Reload uploads"
        disabled={disabled}
        onPress={() => void runtime.refresh()}
      />
      {view.page?.uploads.length === 0 ? <Note>No unclaimed uploads on this page.</Note> : null}
      {view.page?.uploads.map((row) => (
        <UploadRow key={row.uploadId} row={row} runtime={runtime} disabled={disabled} />
      ))}
      {view.page?.next ? (
        <NativeAction
          label="Next uploads"
          disabled={disabled}
          onPress={() => void runtime.next()}
        />
      ) : null}
    </Page>
  );
}
function UploadRow({
  row,
  runtime,
  disabled,
}: {
  row: RecoveryRow;
  runtime: ReceiptRecoveryRuntime;
  disabled: boolean;
}) {
  const router = useRouter();
  return (
    <Section title={row.contentType === "application/pdf" ? "PDF receipt" : "Receipt photo"}>
      <Note>
        Uploaded {row.createdAt.slice(0, 10)} · {Math.ceil(row.bytes / 1024)} KiB
      </Note>
      <Note>
        {row.status === "deleting"
          ? "Removal was started. Confirm removal again to reconcile its outcome."
          : row.stored
            ? "Uploaded, but not attached to recorded financial history."
            : "An upload was reserved, but its file is unavailable."}
      </Note>
      {row.stored && row.status === "pending" ? (
        <NativeAction
          label="Preview receipt"
          disabled={disabled}
          onPress={() => router.push({ pathname: "/receipt", params: { receiptPath: row.path } })}
        />
      ) : null}
      <NativeAction
        label={row.status === "deleting" ? "Retry removal" : "Remove upload"}
        disabled={disabled}
        onPress={() =>
          Alert.alert(
            "Remove this upload?",
            "This removes only an unclaimed receipt. Resolve any pending expense Save first. Recorded financial history is retained.",
            [
              { text: "Keep upload", style: "cancel" },
              {
                text: "Remove upload",
                style: "destructive",
                onPress: () => void runtime.remove(row),
              },
            ],
          )
        }
      />
    </Section>
  );
}

function recoveryDisabled(view: ReceiptRecoveryView) {
  return !view.online || view.busy;
}
