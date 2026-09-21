import { useRouter } from "expo-router";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { ReceiptAttachmentRuntime, ReceiptAttachmentView } from "./receipt-attachment-runtime";
interface Props {
  runtime: ReceiptAttachmentRuntime;
  view: ReceiptAttachmentView;
  disabled: boolean;
}
export function ReceiptAttachmentControls({ runtime, view, disabled }: Props) {
  const unavailable = disabled || !view.active || !view.online || view.busy !== null || view.verify;
  return (
    <Section title="Receipt · optional">
      <Note>Choose a photo or PDF up to 4 MiB. Uploading does not record an expense.</Note>
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.busy ? (
        <Note>{view.busy === "selecting" ? "Choosing a receipt…" : "Uploading receipt…"}</Note>
      ) : null}
      <ReceiptActions runtime={runtime} view={view} disabled={unavailable} />
    </Section>
  );
}

function ReceiptActions({ runtime, view, disabled: unavailable }: Props) {
  const router = useRouter();
  return (
    <>
      {view.status === "empty" ? (
        <>
          <NativeAction
            label="Choose receipt photo"
            disabled={unavailable}
            onPress={() => void runtime.select("photo")}
          />
          <NativeAction
            label="Choose receipt PDF"
            disabled={unavailable}
            onPress={() => void runtime.select("pdf")}
          />
        </>
      ) : null}
      {view.status === "selected" ? (
        <>
          <Note>Receipt selected. Upload it before reviewing this expense.</Note>
          <NativeAction
            label="Upload receipt"
            disabled={unavailable}
            onPress={() => void runtime.upload()}
          />
          <NativeAction
            label="Remove selection"
            disabled={unavailable}
            onPress={runtime.clearSelection}
          />
        </>
      ) : null}
      {view.status === "uncertain" ? (
        <NativeAction
          label="Retry receipt upload"
          disabled={unavailable}
          onPress={() => void runtime.upload()}
        />
      ) : null}
      {view.status === "uploaded" && view.path ? (
        <NativeAction
          label="Preview receipt"
          disabled={unavailable}
          onPress={() => router.push({ pathname: "/receipt", params: { receiptPath: view.path! } })}
        />
      ) : null}
    </>
  );
}
