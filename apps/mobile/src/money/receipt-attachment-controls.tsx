import { Alert } from "react-native";
import type { ExpenseSaveRuntime } from "./save-runtime";
import { prepareReceiptRemoval } from "./receipt-removal";
import { useRouter } from "expo-router";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { ReceiptAttachmentRuntime, ReceiptAttachmentView } from "./receipt-attachment-runtime";
interface Props {
  expense: ExpenseSaveRuntime;
  runtime: ReceiptAttachmentRuntime;
  view: ReceiptAttachmentView;
  disabled: boolean;
}
export function ReceiptAttachmentControls({ runtime, view, disabled, expense }: Props) {
  const unavailable = disabled || !view.active || !view.online || view.busy !== null || view.verify;
  return (
    <Section title="Receipt · optional">
      <Note>Choose a photo or PDF up to 4 MiB. Uploading does not record an expense.</Note>
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.busy ? <Note>{receiptBusyLabel(view.busy)}</Note> : null}
      <ReceiptActions runtime={runtime} view={view} disabled={unavailable} expense={expense} />
      <ReceiptRemoval runtime={runtime} view={view} disabled={unavailable} expense={expense} />
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

function receiptBusyLabel(busy: ReceiptAttachmentView["busy"]) {
  if (busy === "selecting") return "Choosing a receipt…";
  return busy === "removing" ? "Removing receipt…" : "Uploading receipt…";
}
function ReceiptRemoval({ runtime, view, disabled, expense }: Props) {
  if (!["uploaded", "uncertain", "removal_uncertain"].includes(view.status)) return null;
  return (
    <NativeAction
      label={view.status === "removal_uncertain" ? "Retry receipt removal" : "Remove receipt"}
      disabled={disabled}
      onPress={() => {
        const remove = prepareReceiptRemoval(runtime, expense);
        if (!remove) return;
        Alert.alert(
          "Remove this receipt?",
          "Nest will remove this upload only if no recorded expense has claimed it. No financial history will be deleted.",
          [
            { text: "Keep receipt", style: "cancel" },
            { text: "Remove receipt", style: "destructive", onPress: () => void remove() },
          ],
        );
      }}
    />
  );
}
