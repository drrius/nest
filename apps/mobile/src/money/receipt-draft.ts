import type {
  ReceiptAttachmentRuntime,
  ReceiptAttachmentView,
} from "./receipt-attachment-runtime.ts";
export function receiptDraft(view: ReceiptAttachmentView) {
  return {
    receiptPath: view.path,
    receiptPending: view.busy !== null || !["empty", "uploaded"].includes(view.status),
  };
}
export function receiptReady(view: ReceiptAttachmentView) {
  return (
    view.active &&
    view.online &&
    !view.verify &&
    !view.busy &&
    (view.status === "empty" || (view.status === "uploaded" && view.path !== null))
  );
}
export function receiptStillMatches(runtime: ReceiptAttachmentRuntime, path: string | null) {
  const view = runtime.getSnapshot();
  return receiptReady(view) && view.path === path;
}
